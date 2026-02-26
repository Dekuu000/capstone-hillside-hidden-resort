-- ============================================
-- Phase 5: QR Check-in/Out + Override Audit
-- Created: 2026-02-08
-- Purpose: Validate QR, enforce full payment, allow admin override with audit
-- ============================================

-- ====================
-- Audit Logs: allow override_checkin action
-- ====================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_logs_action_check'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs
      DROP CONSTRAINT audit_logs_action_check;
  END IF;
END$$;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check CHECK (
    action IN (
      'create',
      'update',
      'delete',
      'verify',
      'cancel',
      'checkin',
      'checkout',
      'approve',
      'reject',
      'override_checkin'
    )
  );

-- ====================
-- Check-in Logs Table (if missing)
-- ====================

CREATE TABLE IF NOT EXISTS public.checkin_logs (
  checkin_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
  scanned_by_admin_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  checkin_time TIMESTAMPTZ,
  checkout_time TIMESTAMPTZ,
  remarks TEXT
);

ALTER TABLE public.checkin_logs ENABLE ROW LEVEL SECURITY;

-- Policies: admins only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'checkin_logs'
      AND policyname = 'admins_read_checkin_logs'
  ) THEN
    CREATE POLICY "admins_read_checkin_logs" ON public.checkin_logs
      FOR SELECT USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'checkin_logs'
      AND policyname = 'admins_insert_checkin_logs'
  ) THEN
    CREATE POLICY "admins_insert_checkin_logs" ON public.checkin_logs
      FOR INSERT WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'checkin_logs'
      AND policyname = 'admins_update_checkin_logs'
  ) THEN
    CREATE POLICY "admins_update_checkin_logs" ON public.checkin_logs
      FOR UPDATE USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'checkin_logs'
      AND policyname = 'admins_delete_checkin_logs'
  ) THEN
    CREATE POLICY "admins_delete_checkin_logs" ON public.checkin_logs
      FOR DELETE USING (public.is_admin());
  END IF;
END$$;

-- ====================
-- Validate QR Check-in (admin)
-- ====================

CREATE OR REPLACE FUNCTION public.validate_qr_checkin(
  p_reservation_code TEXT
) RETURNS TABLE (
  reservation_id UUID,
  reservation_code TEXT,
  status TEXT,
  check_in_date DATE,
  check_out_date DATE,
  guest_name TEXT,
  total_amount NUMERIC,
  amount_paid_verified NUMERIC,
  balance_due NUMERIC,
  allowed BOOLEAN,
  can_override BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_guest_name TEXT;
  v_balance NUMERIC := 0;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  SELECT r.*
  INTO v_res
  FROM public.reservations r
  WHERE r.reservation_code = p_reservation_code;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      NULL::UUID, p_reservation_code, NULL::TEXT, NULL::DATE, NULL::DATE,
      NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      FALSE, FALSE, 'Reservation not found';
    RETURN;
  END IF;

  SELECT u.name
  INTO v_guest_name
  FROM public.users u
  WHERE u.user_id = v_res.guest_user_id;

  v_balance := COALESCE(v_res.total_amount, 0) - COALESCE(v_res.amount_paid_verified, 0);

  IF v_res.status IN ('cancelled', 'no_show', 'checked_out') THEN
    RETURN QUERY SELECT
      v_res.reservation_id, v_res.reservation_code, v_res.status, v_res.check_in_date, v_res.check_out_date,
      v_guest_name, v_res.total_amount, v_res.amount_paid_verified, v_balance,
      FALSE, FALSE, 'Reservation is not active';
    RETURN;
  END IF;

  IF v_res.status = 'checked_in' THEN
    RETURN QUERY SELECT
      v_res.reservation_id, v_res.reservation_code, v_res.status, v_res.check_in_date, v_res.check_out_date,
      v_guest_name, v_res.total_amount, v_res.amount_paid_verified, v_balance,
      FALSE, FALSE, 'Guest already checked in';
    RETURN;
  END IF;

  IF v_res.check_in_date IS DISTINCT FROM v_today THEN
    RETURN QUERY SELECT
      v_res.reservation_id, v_res.reservation_code, v_res.status, v_res.check_in_date, v_res.check_out_date,
      v_guest_name, v_res.total_amount, v_res.amount_paid_verified, v_balance,
      FALSE, FALSE, 'Check-in allowed only on the reservation date';
    RETURN;
  END IF;

  IF v_balance > 0 THEN
    RETURN QUERY SELECT
      v_res.reservation_id, v_res.reservation_code, v_res.status, v_res.check_in_date, v_res.check_out_date,
      v_guest_name, v_res.total_amount, v_res.amount_paid_verified, v_balance,
      FALSE, TRUE, 'Payment required before check-in';
    RETURN;
  END IF;

  IF v_res.status != 'confirmed' THEN
    RETURN QUERY SELECT
      v_res.reservation_id, v_res.reservation_code, v_res.status, v_res.check_in_date, v_res.check_out_date,
      v_guest_name, v_res.total_amount, v_res.amount_paid_verified, v_balance,
      FALSE, FALSE, 'Reservation not confirmed';
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_res.reservation_id, v_res.reservation_code, v_res.status, v_res.check_in_date, v_res.check_out_date,
    v_guest_name, v_res.total_amount, v_res.amount_paid_verified, v_balance,
    TRUE, FALSE, 'Ready for check-in';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.validate_qr_checkin TO authenticated;

-- ====================
-- Perform Check-in (admin)
-- ====================

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

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Admin access required';
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

GRANT EXECUTE ON FUNCTION public.perform_checkin TO authenticated;

-- ====================
-- Perform Check-out (admin)
-- ====================

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

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Admin access required';
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

GRANT EXECUTE ON FUNCTION public.perform_checkout TO authenticated;
