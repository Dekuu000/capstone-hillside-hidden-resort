-- ============================================
-- Payments lifecycle refactor:
-- 1) Do not create payment rows at reservation creation
-- 2) Create payment rows only on proof submission
-- 3) Keep admin review focused on real submissions
-- Created: 2026-02-18
-- ============================================

-- ====================
-- Reservation creation (stay): no payment insert
-- ====================
CREATE OR REPLACE FUNCTION public.create_reservation_atomic(
  p_guest_user_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_unit_ids UUID[],
  p_rates NUMERIC[],
  p_total_amount NUMERIC,
  p_deposit_required NUMERIC DEFAULT NULL,
  p_expected_pay_now NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS TABLE (
  reservation_id UUID,
  reservation_code TEXT,
  status TEXT,
  message TEXT
) AS $$
DECLARE
  v_reservation_id UUID;
  v_code TEXT;
  v_deposit NUMERIC;
  v_unit_id UUID;
  v_available BOOLEAN;
  v_nights INTEGER;
  i INTEGER;
  v_rates NUMERIC[];
  v_total NUMERIC := 0;
  v_has_pavilion BOOLEAN := FALSE;
  v_has_function_hall BOOLEAN := FALSE;
  v_has_room BOOLEAN := FALSE;
  v_has_cottage BOOLEAN := FALSE;
  v_role TEXT;
  v_expected_pay_now NUMERIC;
BEGIN
  IF p_check_in >= p_check_out THEN
    RAISE EXCEPTION 'Invalid dates: check-out must be after check-in'
      USING HINT = 'Please select a check-out date that is later than the check-in date';
  END IF;

  IF p_check_in < CURRENT_DATE THEN
    RAISE EXCEPTION 'Invalid dates: check-in must be in the future'
      USING HINT = 'Cannot create reservations for past dates';
  END IF;

  v_nights := (p_check_out - p_check_in)::INTEGER;
  IF v_nights > 30 THEN
    RAISE EXCEPTION 'Maximum stay is 30 nights. Current selection: % nights', v_nights;
  END IF;

  IF array_length(p_unit_ids, 1) IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No units selected'
      USING HINT = 'Please select at least one unit';
  END IF;

  IF array_length(p_unit_ids, 1) > 10 THEN
    RAISE EXCEPTION 'Maximum 10 units per reservation. Current selection: % units', array_length(p_unit_ids, 1);
  END IF;

  IF array_length(p_unit_ids, 1) != array_length(p_rates, 1) THEN
    RAISE EXCEPTION 'Mismatched units and rates arrays'
      USING HINT = 'System error. Please try again.';
  END IF;

  BEGIN
    PERFORM * FROM public.units
    WHERE unit_id = ANY(p_unit_ids)
    AND is_active = true
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE EXCEPTION 'System busy processing this unit. Please try again in a moment.'
        USING HINT = 'Another reservation is being created for one of these units';
  END;

  IF (SELECT COUNT(*) FROM public.units WHERE unit_id = ANY(p_unit_ids) AND is_active = true)
     != array_length(p_unit_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected units are not available'
      USING HINT = 'Some units may have been deactivated. Please refresh and try again.';
  END IF;

  FOR i IN 1..array_length(p_unit_ids, 1) LOOP
    v_unit_id := p_unit_ids[i];
    SELECT public.check_unit_availability(v_unit_id, p_check_in, p_check_out, NULL)
    INTO v_available;
    IF NOT v_available THEN
      RAISE EXCEPTION 'Unit not available for selected dates'
        USING HINT = 'One or more units are already booked for these dates. Please select different dates or units.';
    END IF;
  END LOOP;

  SELECT array_agg(u.base_price ORDER BY x.ord)
  INTO v_rates
  FROM unnest(p_unit_ids) WITH ORDINALITY AS x(unit_id, ord)
  JOIN public.units u ON u.unit_id = x.unit_id AND u.is_active = true;

  IF v_rates IS NULL OR array_length(v_rates, 1) != array_length(p_unit_ids, 1) THEN
    RAISE EXCEPTION 'Invalid unit selection'
      USING HINT = 'Please refresh and try again.';
  END IF;

  v_total := 0;
  FOR i IN 1..array_length(v_rates, 1) LOOP
    v_total := v_total + (v_rates[i] * v_nights);
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount'
      USING HINT = 'Total amount must be greater than zero';
  END IF;

  SELECT
    bool_or(lower(u.name) LIKE '%pavilion%'),
    bool_or(lower(u.name) LIKE '%function hall%'),
    bool_or(u.type = 'room'),
    bool_or(u.type = 'cottage')
  INTO v_has_pavilion, v_has_function_hall, v_has_room, v_has_cottage
  FROM public.units u
  WHERE u.unit_id = ANY(p_unit_ids);

  v_deposit := CASE
    WHEN v_has_pavilion OR v_has_function_hall THEN 1000
    WHEN v_has_room THEN 1000
    WHEN v_has_cottage THEN 500
    ELSE 0
  END;

  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF p_deposit_required IS NOT NULL AND v_role = 'admin' THEN
    v_deposit := p_deposit_required;
  END IF;

  v_expected_pay_now := v_deposit;
  IF p_expected_pay_now IS NOT NULL THEN
    IF p_expected_pay_now < v_deposit OR p_expected_pay_now > v_total THEN
      RAISE EXCEPTION 'Expected pay now must be between % and %', v_deposit, v_total;
    END IF;
    v_expected_pay_now := p_expected_pay_now;
  END IF;

  v_code := public.generate_reservation_code();

  INSERT INTO public.reservations (
    reservation_code,
    guest_user_id,
    check_in_date,
    check_out_date,
    total_amount,
    deposit_required,
    expected_pay_now,
    amount_paid_verified,
    status,
    notes,
    hold_expires_at
  ) VALUES (
    v_code,
    p_guest_user_id,
    p_check_in,
    p_check_out,
    v_total,
    v_deposit,
    v_expected_pay_now,
    0,
    'pending_payment',
    p_notes,
    NOW() + INTERVAL '24 hours'
  ) RETURNING reservations.reservation_id INTO v_reservation_id;

  FOR i IN 1..array_length(p_unit_ids, 1) LOOP
    INSERT INTO public.reservation_units (
      reservation_id,
      unit_id,
      rate_snapshot,
      quantity_or_nights
    ) VALUES (
      v_reservation_id,
      p_unit_ids[i],
      v_rates[i],
      v_nights
    );
  END LOOP;

  INSERT INTO public.audit_logs (
    performed_by_user_id,
    entity_type,
    entity_id,
    action,
    data_hash,
    metadata
  ) VALUES (
    p_guest_user_id,
    'reservation',
    v_reservation_id::TEXT,
    'create',
    encode(digest(concat(v_code, v_total::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_code', v_code,
      'check_in', p_check_in,
      'check_out', p_check_out,
      'total_amount', v_total,
      'unit_count', array_length(p_unit_ids, 1)
    )
  );

  RETURN QUERY SELECT
    v_reservation_id,
    v_code,
    'pending_payment'::TEXT,
    'Reservation created successfully. Please complete payment within 24 hours.'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_reservation_atomic TO authenticated;

-- ====================
-- Reservation creation (tour): no payment insert
-- ====================
CREATE OR REPLACE FUNCTION public.create_tour_reservation_atomic(
  p_guest_user_id UUID,
  p_service_id UUID,
  p_visit_date DATE,
  p_adult_qty INTEGER,
  p_kid_qty INTEGER,
  p_is_advance BOOLEAN,
  p_deposit_override NUMERIC DEFAULT NULL,
  p_expected_pay_now NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS TABLE (
  reservation_id UUID,
  reservation_code TEXT,
  status TEXT,
  message TEXT
) AS $$
DECLARE
  v_reservation_id UUID;
  v_code TEXT;
  v_deposit NUMERIC;
  v_total NUMERIC := 0;
  v_role TEXT;
  v_service public.services%ROWTYPE;
  v_adult_qty INTEGER := COALESCE(p_adult_qty, 0);
  v_kid_qty INTEGER := COALESCE(p_kid_qty, 0);
  v_expected_pay_now NUMERIC;
BEGIN
  IF p_guest_user_id IS NULL THEN
    RAISE EXCEPTION 'Guest user is required';
  END IF;

  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_role != 'admin' AND p_guest_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to create this reservation';
  END IF;

  IF v_role != 'admin' AND p_is_advance IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Guests can only create advance tour reservations';
  END IF;

  IF p_visit_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Invalid date: visit date must be in the future';
  END IF;

  IF v_adult_qty < 0 OR v_kid_qty < 0 THEN
    RAISE EXCEPTION 'Invalid quantities';
  END IF;

  IF (v_adult_qty + v_kid_qty) = 0 THEN
    RAISE EXCEPTION 'At least one guest is required';
  END IF;

  SELECT * INTO v_service
  FROM public.services s
  WHERE s.service_id = p_service_id
    AND s.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or inactive';
  END IF;

  v_total := (v_adult_qty * v_service.adult_rate) + (v_kid_qty * v_service.kid_rate);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount';
  END IF;

  v_deposit := CASE
    WHEN p_is_advance THEN LEAST(500, v_total)
    ELSE 0
  END;

  IF p_deposit_override IS NOT NULL AND v_role = 'admin' THEN
    v_deposit := p_deposit_override;
  END IF;

  v_expected_pay_now := v_deposit;
  IF p_expected_pay_now IS NOT NULL THEN
    IF p_expected_pay_now < v_deposit OR p_expected_pay_now > v_total THEN
      RAISE EXCEPTION 'Expected pay now must be between % and %', v_deposit, v_total;
    END IF;
    v_expected_pay_now := p_expected_pay_now;
  END IF;

  v_code := public.generate_reservation_code();

  INSERT INTO public.reservations (
    reservation_code,
    guest_user_id,
    check_in_date,
    check_out_date,
    total_amount,
    deposit_required,
    expected_pay_now,
    amount_paid_verified,
    status,
    notes,
    hold_expires_at
  ) VALUES (
    v_code,
    p_guest_user_id,
    p_visit_date,
    (p_visit_date + INTERVAL '1 day')::date,
    v_total,
    v_deposit,
    v_expected_pay_now,
    0,
    'pending_payment',
    p_notes,
    CASE WHEN p_is_advance THEN NOW() + INTERVAL '24 hours' ELSE NULL END
  ) RETURNING reservations.reservation_id INTO v_reservation_id;

  INSERT INTO public.service_bookings (
    service_id,
    reservation_id,
    guest_user_id,
    visit_date,
    adult_qty,
    kid_qty,
    adult_rate_snapshot,
    kid_rate_snapshot,
    total_amount,
    status
  ) VALUES (
    p_service_id,
    v_reservation_id,
    p_guest_user_id,
    p_visit_date,
    v_adult_qty,
    v_kid_qty,
    v_service.adult_rate,
    v_service.kid_rate,
    v_total,
    'pending_payment'
  );

  PERFORM public.create_audit_log(
    'reservation',
    v_reservation_id::TEXT,
    'create',
    encode(digest(concat(v_code, v_total::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_code', v_code,
      'visit_date', p_visit_date,
      'service_id', p_service_id,
      'adult_qty', v_adult_qty,
      'kid_qty', v_kid_qty,
      'total_amount', v_total
    )
  );

  RETURN QUERY SELECT
    v_reservation_id,
    v_code,
    'pending_payment'::TEXT,
    'Tour reservation created successfully. Please complete payment within 24 hours.'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_tour_reservation_atomic TO authenticated;

-- ====================
-- Update pay-now amount (intent only, no payment insert)
-- ====================
CREATE OR REPLACE FUNCTION public.update_payment_intent_amount(
  p_reservation_id UUID,
  p_amount NUMERIC
) RETURNS VOID AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_role != 'admin' AND v_res.guest_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to update this payment';
  END IF;

  IF v_res.status != 'pending_payment' THEN
    RAISE EXCEPTION 'Amount is locked after proof submission';
  END IF;

  IF p_amount < COALESCE(v_res.deposit_required, 0) THEN
    RAISE EXCEPTION 'Minimum deposit is %', COALESCE(v_res.deposit_required, 0);
  END IF;

  IF p_amount > v_res.total_amount THEN
    RAISE EXCEPTION 'Cannot exceed total %', v_res.total_amount;
  END IF;

  UPDATE public.reservations
  SET expected_pay_now = p_amount
  WHERE reservation_id = p_reservation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_payment_intent_amount TO authenticated;

-- ====================
-- Submit payment proof: create/update real submission row then set for_verification
-- ====================
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
  p_reservation_id UUID,
  p_payment_type TEXT,
  p_amount NUMERIC,
  p_method TEXT,
  p_reference_no TEXT DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
  v_res public.reservations%ROWTYPE;
  v_role TEXT;
  v_pending_payment public.payments%ROWTYPE;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_role != 'admin' AND v_res.guest_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to submit payment for this reservation';
  END IF;

  IF v_res.status IN ('cancelled', 'no_show', 'checked_out') THEN
    RAISE EXCEPTION 'Reservation is not eligible for payment';
  END IF;

  IF v_res.status NOT IN ('pending_payment', 'for_verification') THEN
    RAISE EXCEPTION 'Reservation is not in a payable state';
  END IF;

  IF (p_reference_no IS NULL OR length(trim(p_reference_no)) = 0)
     AND (p_proof_url IS NULL OR length(trim(p_proof_url)) = 0) THEN
    RAISE EXCEPTION 'Reference number or proof of payment is required';
  END IF;

  SELECT *
  INTO v_pending_payment
  FROM public.payments
  WHERE reservation_id = p_reservation_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND (v_pending_payment.proof_url IS NOT NULL OR v_pending_payment.reference_no IS NOT NULL) THEN
    RAISE EXCEPTION 'A payment is already pending verification';
  END IF;

  IF v_role != 'admin' THEN
    IF p_payment_type NOT IN ('deposit', 'full') THEN
      RAISE EXCEPTION 'Invalid payment type for guest';
    END IF;
    IF p_method != 'gcash' THEN
      RAISE EXCEPTION 'Guests can only use GCash for online payments';
    END IF;
    IF p_proof_url IS NULL OR length(trim(p_proof_url)) = 0 THEN
      RAISE EXCEPTION 'Proof of payment is required';
    END IF;
  END IF;

  IF p_payment_type = 'deposit' THEN
    IF v_res.deposit_required IS NULL OR v_res.deposit_required <= 0 THEN
      RAISE EXCEPTION 'Deposit is not required for this reservation';
    END IF;
    IF v_role != 'admin' AND v_res.expected_pay_now IS NOT NULL AND p_amount != v_res.expected_pay_now THEN
      RAISE EXCEPTION 'Payment amount must match the selected pay-now amount';
    END IF;
    IF p_amount < v_res.deposit_required THEN
      RAISE EXCEPTION 'Deposit amount must be at least %', v_res.deposit_required;
    END IF;
    IF p_amount >= v_res.total_amount THEN
      RAISE EXCEPTION 'Use full payment for total amount';
    END IF;
  ELSIF p_payment_type = 'full' THEN
    IF v_role != 'admin' AND v_res.expected_pay_now IS NOT NULL AND p_amount != v_res.expected_pay_now THEN
      RAISE EXCEPTION 'Payment amount must match the selected pay-now amount';
    END IF;
    IF p_amount != v_res.total_amount THEN
      RAISE EXCEPTION 'Full payment must be exactly %', v_res.total_amount;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid payment type';
  END IF;

  IF FOUND THEN
    UPDATE public.payments
    SET payment_type = p_payment_type,
        method = p_method,
        amount = p_amount,
        reference_no = p_reference_no,
        proof_url = p_proof_url,
        status = 'pending',
        verified_by_admin_id = NULL,
        verified_at = NULL
    WHERE payment_id = v_pending_payment.payment_id
    RETURNING payment_id INTO v_payment_id;
  ELSE
    INSERT INTO public.payments (
      reservation_id,
      payment_type,
      method,
      amount,
      reference_no,
      proof_url,
      status
    ) VALUES (
      p_reservation_id,
      p_payment_type,
      p_method,
      p_amount,
      p_reference_no,
      p_proof_url,
      'pending'
    ) RETURNING payment_id INTO v_payment_id;
  END IF;

  UPDATE public.reservations
  SET status = 'for_verification'
  WHERE reservation_id = p_reservation_id;

  PERFORM public.create_audit_log(
    'payment',
    v_payment_id::TEXT,
    'create',
    encode(digest(concat(v_payment_id::TEXT, p_amount::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_id', p_reservation_id,
      'payment_type', p_payment_type,
      'method', p_method,
      'amount', p_amount
    )
  );

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.submit_payment_proof TO authenticated;

-- ====================
-- Verify/reject payment: recompute verified totals; reject -> pending_payment
-- ====================
CREATE OR REPLACE FUNCTION public.verify_payment(
  p_payment_id UUID,
  p_approved BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_role TEXT;
  v_total_verified NUMERIC;
  v_res public.reservations%ROWTYPE;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE payment_id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.status != 'pending' THEN
    RAISE EXCEPTION 'Payment already processed';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE reservation_id = v_payment.reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_res.status IN ('cancelled', 'no_show', 'checked_out') THEN
    RAISE EXCEPTION 'Reservation is not eligible for payment verification';
  END IF;

  IF p_approved THEN
    UPDATE public.payments
    SET status = 'verified',
        verified_by_admin_id = auth.uid(),
        verified_at = NOW()
    WHERE payment_id = p_payment_id;
  ELSE
    UPDATE public.payments
    SET status = 'rejected',
        verified_by_admin_id = auth.uid(),
        verified_at = NOW()
    WHERE payment_id = p_payment_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_verified
  FROM public.payments
  WHERE reservation_id = v_payment.reservation_id
    AND status = 'verified';

  UPDATE public.reservations
  SET amount_paid_verified = v_total_verified,
      status = CASE
        WHEN p_approved THEN 'confirmed'
        ELSE 'pending_payment'
      END
  WHERE reservation_id = v_payment.reservation_id;

  PERFORM public.create_audit_log(
    'payment',
    v_payment.payment_id::TEXT,
    CASE WHEN p_approved THEN 'verify' ELSE 'reject' END,
    encode(digest(concat(v_payment.payment_id::TEXT, p_approved::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_id', v_payment.reservation_id,
      'approved', p_approved,
      'amount', v_payment.amount
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.verify_payment TO authenticated;
