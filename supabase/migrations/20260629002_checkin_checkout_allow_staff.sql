-- ============================================
-- Allow Front Desk (staff) to perform check-in / check-out
-- Created: 2026-06-29
-- Same RBAC gap as record_on_site_payment (20260629001): the API routes
-- POST /v2/operations/checkins and /checkouts use require_operations (staff+),
-- but these RPCs still hard-required role = 'admin' and raised "Admin access
-- required", so Front Desk passed the API guard and was rejected at the database.
-- Open the role check to the operations tier (staff, admin, super_admin) to match
-- the API. Bodies are otherwise identical to 20260208001_phase5_checkin_rpcs.sql.
-- ============================================

CREATE OR REPLACE FUNCTION public.perform_checkin(
  p_reservation_id UUID,
  p_override_reason TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_role TEXT;
  v_res public.reservations%ROWTYPE;
  v_balance NUMERIC := 0;
  v_override BOOLEAN := FALSE;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('staff', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_res.status IN ('cancelled', 'no_show', 'checked_out') THEN
    RAISE EXCEPTION 'Reservation is not active';
  END IF;

  IF v_res.status = 'checked_in' THEN
    RAISE EXCEPTION 'Already checked in';
  END IF;

  IF v_res.check_in_date IS DISTINCT FROM (NOW() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'Check-in allowed only on the reservation date';
  END IF;

  v_balance := COALESCE(v_res.total_amount, 0) - COALESCE(v_res.amount_paid_verified, 0);

  IF v_balance > 0 THEN
    IF p_override_reason IS NULL OR length(trim(p_override_reason)) = 0 THEN
      RAISE EXCEPTION 'Override reason is required';
    END IF;
    v_override := TRUE;
  END IF;

  IF v_balance = 0 AND v_res.status != 'confirmed' THEN
    RAISE EXCEPTION 'Reservation not confirmed';
  END IF;

  INSERT INTO public.checkin_logs (
    reservation_id,
    scanned_by_admin_id,
    checkin_time,
    remarks
  ) VALUES (
    p_reservation_id,
    auth.uid(),
    NOW(),
    CASE
      WHEN v_override THEN concat('Override check-in: ', trim(p_override_reason))
      ELSE NULL
    END
  );

  UPDATE public.reservations
  SET status = 'checked_in'
  WHERE reservation_id = p_reservation_id;

  PERFORM public.create_audit_log(
    'reservation',
    p_reservation_id::TEXT,
    CASE WHEN v_override THEN 'override_checkin' ELSE 'checkin' END,
    encode(digest(concat(v_res.reservation_code, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_code', v_res.reservation_code,
      'override', v_override,
      'reason', CASE WHEN v_override THEN trim(p_override_reason) ELSE NULL END,
      'balance_due', v_balance
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.perform_checkout(
  p_reservation_id UUID
) RETURNS VOID AS $$
DECLARE
  v_role TEXT;
  v_res public.reservations%ROWTYPE;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('staff', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_res.status != 'checked_in' THEN
    RAISE EXCEPTION 'Reservation is not checked in';
  END IF;

  UPDATE public.checkin_logs
  SET checkout_time = NOW()
  WHERE reservation_id = p_reservation_id
    AND checkout_time IS NULL;

  UPDATE public.reservations
  SET status = 'checked_out'
  WHERE reservation_id = p_reservation_id;

  PERFORM public.create_audit_log(
    'reservation',
    p_reservation_id::TEXT,
    'checkout',
    encode(digest(concat(v_res.reservation_code, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_code', v_res.reservation_code
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
