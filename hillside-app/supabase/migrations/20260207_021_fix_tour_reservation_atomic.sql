-- ============================================
-- Phase 4: Fix tour reservation RPC (date cast + required guest id)
-- Created: 2026-02-07
-- Purpose: Ensure correct date insertion and clearer validation
-- ============================================

CREATE OR REPLACE FUNCTION public.create_tour_reservation_atomic(
  p_guest_user_id UUID,
  p_service_id UUID,
  p_visit_date DATE,
  p_adult_qty INTEGER,
  p_kid_qty INTEGER,
  p_is_advance BOOLEAN,
  p_deposit_override NUMERIC DEFAULT NULL,
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
  FROM public.services
  WHERE service_id = p_service_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or inactive';
  END IF;

  v_total := (v_adult_qty * v_service.adult_rate) + (v_kid_qty * v_service.kid_rate);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount';
  END IF;

  v_deposit := CASE
    WHEN p_is_advance THEN 500
    ELSE 0
  END;

  IF p_deposit_override IS NOT NULL AND v_role = 'admin' THEN
    v_deposit := p_deposit_override;
  END IF;

  v_code := public.generate_reservation_code();

  INSERT INTO public.reservations (
    reservation_code,
    guest_user_id,
    check_in_date,
    check_out_date,
    total_amount,
    deposit_required,
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
