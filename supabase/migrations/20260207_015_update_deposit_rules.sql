-- ============================================
-- Phase 4: Update deposit rules (exclusive amenities)
-- Created: 2026-02-07
-- Purpose: Include Function Hall / Pavilion deposits
-- ============================================

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
  -- ====================
  -- Input Validation
  -- ====================

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

  -- ====================
  -- Atomic Unit Locking
  -- ====================

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

  -- ====================
  -- Availability Check
  -- ====================

  FOR i IN 1..array_length(p_unit_ids, 1) LOOP
    v_unit_id := p_unit_ids[i];

    SELECT public.check_unit_availability(
      v_unit_id,
      p_check_in,
      p_check_out,
      NULL
    ) INTO v_available;

    IF NOT v_available THEN
      RAISE EXCEPTION 'Unit not available for selected dates'
        USING HINT = 'One or more units are already booked for these dates. Please select different dates or units.';
    END IF;
  END LOOP;

  -- ====================
  -- Compute Rates + Total (server-side)
  -- ====================

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

  -- ====================
  -- Deposit Rules (server-side)
  -- ====================

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

  -- ====================
  -- Create Reservation
  -- ====================

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

  -- Create pending payment intent (guest online payments)
  IF v_role != 'admin' AND v_expected_pay_now > 0 THEN
    INSERT INTO public.payments (
      reservation_id,
      payment_type,
      method,
      amount,
      status
    ) VALUES (
      v_reservation_id,
      CASE WHEN v_expected_pay_now >= v_total THEN 'full' ELSE 'deposit' END,
      'gcash',
      v_expected_pay_now,
      'pending'
    );
  END IF;

  -- ====================
  -- Insert Reservation Units
  -- ====================

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

  -- ====================
  -- Create Audit Log
  -- ====================

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
