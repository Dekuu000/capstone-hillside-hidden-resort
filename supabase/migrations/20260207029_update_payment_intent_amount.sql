-- ============================================
-- Phase 4: Update payment intent amount (guest)
-- Created: 2026-02-07
-- Purpose: Allow guests to adjust pay-now before proof
-- ============================================

CREATE OR REPLACE FUNCTION public.update_payment_intent_amount(
  p_reservation_id UUID,
  p_amount NUMERIC
) RETURNS VOID AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_role TEXT;
  v_pending public.payments%ROWTYPE;
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

  SELECT *
  INTO v_pending
  FROM public.payments
  WHERE reservation_id = p_reservation_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND (v_pending.proof_url IS NOT NULL OR v_pending.reference_no IS NOT NULL) THEN
    RAISE EXCEPTION 'Amount is locked after proof submission';
  END IF;

  IF FOUND THEN
    UPDATE public.payments
    SET amount = p_amount,
        payment_type = CASE WHEN p_amount >= v_res.total_amount THEN 'full' ELSE 'deposit' END,
        method = 'gcash'
    WHERE payment_id = v_pending.payment_id;
  ELSE
    INSERT INTO public.payments (
      reservation_id,
      payment_type,
      method,
      amount,
      status
    ) VALUES (
      p_reservation_id,
      CASE WHEN p_amount >= v_res.total_amount THEN 'full' ELSE 'deposit' END,
      'gcash',
      p_amount,
      'pending'
    );
  END IF;

  UPDATE public.reservations
  SET expected_pay_now = p_amount
  WHERE reservation_id = p_reservation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_payment_intent_amount TO authenticated;
