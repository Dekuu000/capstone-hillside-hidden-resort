-- ============================================
-- Allow Front Desk (staff) to record on-site payments
-- Created: 2026-06-29
-- The API route POST /v2/payments/on-site was opened to the operations tier
-- (require_operations = staff and up) in the RBAC pass, but this RPC still
-- hard-required role = 'admin' and raised "Admin access required". Front Desk
-- therefore passed the API guard but was rejected at the database with a 400,
-- so they could never settle a walk-in. Open the role check to the operations
-- tier (staff, admin, super_admin) to match the API. Body is otherwise identical
-- to 20260207017_record_on_site_payment.sql.
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
