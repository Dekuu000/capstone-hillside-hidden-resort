-- ============================================
-- Phase 4: Flexible deposit payments
-- Created: 2026-02-07
-- Purpose: Allow guests to pay more than minimum deposit
-- ============================================

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

  -- Guest restrictions (online payments only)
  IF v_role != 'admin' THEN
    IF p_payment_type NOT IN ('deposit', 'full') THEN
      RAISE EXCEPTION 'Invalid payment type for guest';
    END IF;
    IF p_method != 'gcash' THEN
      RAISE EXCEPTION 'Guests can only use GCash for online payments';
    END IF;
    IF p_reference_no IS NULL OR length(trim(p_reference_no)) = 0 THEN
      RAISE EXCEPTION 'Reference number is required';
    END IF;
    IF p_proof_url IS NULL OR length(trim(p_proof_url)) = 0 THEN
      RAISE EXCEPTION 'Proof of payment is required';
    END IF;
  END IF;

  -- Amount validation (flexible deposit)
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
  END IF;

  IF FOUND THEN
    UPDATE public.payments
    SET payment_type = p_payment_type,
        method = p_method,
        amount = p_amount,
        reference_no = p_reference_no,
        proof_url = p_proof_url,
        status = 'pending'
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

GRANT EXECUTE ON FUNCTION public.submit_payment_proof TO authenticated;
