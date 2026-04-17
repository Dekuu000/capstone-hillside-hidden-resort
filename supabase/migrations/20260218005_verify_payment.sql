-- ============================================
-- Payments lifecycle refactor (split for Supabase CLI parser compatibility)
-- Created: 2026-02-18
-- ============================================

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
