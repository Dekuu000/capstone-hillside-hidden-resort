-- ============================================
-- Payment rejection with reason
-- Created: 2026-02-18
-- ============================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by_admin_id UUID REFERENCES public.users(user_id);

CREATE OR REPLACE FUNCTION public.reject_payment_with_reason(
  p_payment_id UUID,
  p_rejected_reason TEXT
) RETURNS VOID AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_res public.reservations%ROWTYPE;
  v_role TEXT;
  v_total_verified NUMERIC;
  v_rejected_at TIMESTAMPTZ := NOW();
  v_reason TEXT := trim(COALESCE(p_rejected_reason, ''));
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Rejected reason must be at least 5 characters';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE payment_id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.status != 'pending' THEN
    RAISE EXCEPTION 'Only pending payments can be rejected';
  END IF;

  IF COALESCE(length(trim(v_payment.proof_url)), 0) = 0
     AND COALESCE(length(trim(v_payment.reference_no)), 0) = 0 THEN
    RAISE EXCEPTION 'Cannot reject payment with no submitted proof/reference';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE reservation_id = v_payment.reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_res.status IN ('cancelled', 'no_show', 'checked_out') THEN
    RAISE EXCEPTION 'Cancelled/closed reservations are read-only for payment review';
  END IF;

  UPDATE public.payments
  SET status = 'rejected',
      rejected_reason = v_reason,
      rejected_at = v_rejected_at,
      rejected_by_admin_id = auth.uid(),
      verified_by_admin_id = NULL,
      verified_at = NULL
  WHERE payment_id = p_payment_id;

  IF v_res.status = 'for_verification' THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_verified
    FROM public.payments
    WHERE reservation_id = v_res.reservation_id
      AND status = 'verified';

    UPDATE public.reservations
    SET status = 'pending_payment',
        amount_paid_verified = v_total_verified
    WHERE reservation_id = v_res.reservation_id;
  END IF;

  PERFORM public.create_audit_log(
    'payment',
    v_payment.payment_id::TEXT,
    'reject',
    encode(
      digest(
        concat_ws(
          '|',
          v_payment.payment_id::TEXT,
          v_payment.reservation_id::TEXT,
          v_payment.amount::TEXT,
          v_reason,
          v_rejected_at::TEXT
        ),
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object(
      'reservation_id', v_payment.reservation_id,
      'amount', v_payment.amount,
      'reason', v_reason,
      'rejected_at', v_rejected_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

  IF NOT p_approved THEN
    RAISE EXCEPTION 'Use reject_payment_with_reason for payment rejection';
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

  UPDATE public.payments
  SET status = 'verified',
      verified_by_admin_id = auth.uid(),
      verified_at = NOW(),
      rejected_reason = NULL,
      rejected_at = NULL,
      rejected_by_admin_id = NULL
  WHERE payment_id = p_payment_id;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_verified
  FROM public.payments
  WHERE reservation_id = v_payment.reservation_id
    AND status = 'verified';

  UPDATE public.reservations
  SET amount_paid_verified = v_total_verified,
      status = 'confirmed'
  WHERE reservation_id = v_payment.reservation_id;

  PERFORM public.create_audit_log(
    'payment',
    v_payment.payment_id::TEXT,
    'verify',
    encode(digest(concat(v_payment.payment_id::TEXT, p_approved::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_id', v_payment.reservation_id,
      'approved', p_approved,
      'amount', v_payment.amount
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.reject_payment_with_reason(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment_with_reason(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_payment(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_payment(UUID, BOOLEAN) TO authenticated;
