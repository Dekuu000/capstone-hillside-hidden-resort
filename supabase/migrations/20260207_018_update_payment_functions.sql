-- ============================================
-- Phase 4: Update submit_payment_proof validations
-- Created: 2026-02-07
-- Purpose: Enforce proof + reference for guest submissions
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
    IF p_reference_no IS NULL OR length(trim(p_reference_no)) = 0 THEN
      RAISE EXCEPTION 'Reference number is required';
    END IF;
    IF p_proof_url IS NULL OR length(trim(p_proof_url)) = 0 THEN
      RAISE EXCEPTION 'Proof of payment is required';
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

  UPDATE public.reservations
  SET status = 'for_verification'
  WHERE reservation_id = p_reservation_id
    AND status = 'pending_payment';

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
