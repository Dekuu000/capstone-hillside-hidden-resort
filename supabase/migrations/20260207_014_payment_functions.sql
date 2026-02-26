-- ============================================
-- Phase 4: Payment RPCs (submit + verify)
-- Created: 2026-02-07
-- Purpose: Secure payment submission and verification
-- ============================================

-- Submit payment proof (guest or admin)
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

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE reservation_id = p_reservation_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A payment is already pending verification';
  END IF;

  -- Guest restrictions (online payments only)
  IF v_role != 'admin' THEN
    IF p_payment_type NOT IN ('deposit', 'full') THEN
      RAISE EXCEPTION 'Invalid payment type for guest';
    END IF;
    IF p_method != 'gcash' THEN
      RAISE EXCEPTION 'Guests can only use GCash for online payments';
    END IF;
  END IF;

  -- Amount validation
  IF p_payment_type = 'deposit' THEN
    IF v_res.deposit_required IS NULL OR v_res.deposit_required <= 0 THEN
      RAISE EXCEPTION 'Deposit is not required for this reservation';
    END IF;
    IF p_amount != v_res.deposit_required THEN
      RAISE EXCEPTION 'Deposit amount must be exactly %', v_res.deposit_required;
    END IF;
  ELSIF p_payment_type = 'full' THEN
    IF p_amount != v_res.total_amount THEN
      RAISE EXCEPTION 'Full payment must be exactly %', v_res.total_amount;
    END IF;
  END IF;

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

  -- Move to for_verification once proof is submitted
  UPDATE public.reservations
  SET status = 'for_verification'
  WHERE reservation_id = p_reservation_id
    AND status = 'pending_payment';

  -- Audit log
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

-- Verify or reject payment (admin only)
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

  IF p_approved THEN
    UPDATE public.payments
    SET status = 'verified',
        verified_by_admin_id = auth.uid(),
        verified_at = NOW()
    WHERE payment_id = p_payment_id;

    UPDATE public.reservations
    SET amount_paid_verified = amount_paid_verified + v_payment.amount
    WHERE reservation_id = v_payment.reservation_id;
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
        WHEN v_total_verified >= COALESCE(v_res.deposit_required, 0)
             AND (v_res.deposit_required IS NOT NULL AND v_res.deposit_required > 0)
          THEN 'confirmed'
        WHEN v_total_verified >= v_res.total_amount AND v_res.total_amount > 0
          THEN 'confirmed'
        ELSE CASE
          WHEN v_total_verified > 0 THEN 'for_verification'
          ELSE 'pending_payment'
        END
      END
  WHERE reservation_id = v_payment.reservation_id;

  -- Audit log
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

GRANT EXECUTE ON FUNCTION public.submit_payment_proof TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_payment TO authenticated;
