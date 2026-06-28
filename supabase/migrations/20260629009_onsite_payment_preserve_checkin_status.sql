-- ============================================
-- On-site payment: don't downgrade a checked-in booking when its balance is paid
-- Created: 2026-06-29
-- For the folio "settle at check-out" flow the desk collects the room balance from a
-- guest who is already CHECKED_IN. The old status CASE would recompute status to
-- 'confirmed' (paid >= total), regressing checked_in -> confirmed and then breaking
-- perform_checkout ("not checked in"). Preserve checked_in. Body is otherwise
-- identical to 20260629001_record_on_site_payment_allow_staff.sql.
-- ============================================

CREATE OR REPLACE FUNCTION public.record_on_site_payment(
  p_reservation_id UUID,
  p_amount NUMERIC,
  p_method TEXT,
  p_reference_no TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
  v_role TEXT;
  v_total_verified NUMERIC;
  v_res public.reservations%ROWTYPE;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('staff', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF p_method NOT IN ('cash', 'gcash', 'bank', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_res.status IN ('cancelled', 'no_show', 'checked_out') THEN
    RAISE EXCEPTION 'Reservation is not eligible for payment';
  END IF;

  IF p_amount > (v_res.total_amount - v_res.amount_paid_verified) THEN
    RAISE EXCEPTION 'Amount exceeds remaining balance';
  END IF;

  INSERT INTO public.payments (
    reservation_id,
    payment_type,
    method,
    amount,
    reference_no,
    status,
    verified_by_admin_id,
    verified_at
  ) VALUES (
    p_reservation_id,
    'on_site',
    p_method,
    p_amount,
    p_reference_no,
    'verified',
    auth.uid(),
    NOW()
  ) RETURNING payment_id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_verified
  FROM public.payments
  WHERE reservation_id = p_reservation_id
    AND status = 'verified';

  UPDATE public.reservations
  SET amount_paid_verified = v_total_verified,
      status = CASE
        -- An in-stay / departed booking keeps its lifecycle status when a balance
        -- is collected (a payment must never roll it back to confirmed).
        WHEN v_res.status IN ('checked_in', 'checked_out') THEN v_res.status
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
  WHERE reservation_id = p_reservation_id;

  PERFORM public.create_audit_log(
    'payment',
    v_payment_id::TEXT,
    'create',
    encode(digest(concat(v_payment_id::TEXT, p_amount::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_id', p_reservation_id,
      'payment_type', 'on_site',
      'method', p_method,
      'amount', p_amount
    )
  );

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
