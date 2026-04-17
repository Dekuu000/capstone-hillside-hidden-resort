-- ============================================
-- Payments lifecycle refactor (split for Supabase CLI parser compatibility)
-- Created: 2026-02-18
-- ============================================

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
