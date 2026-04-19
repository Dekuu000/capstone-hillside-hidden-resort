-- ====================
-- Cancellation policy capture
-- ====================
CREATE OR REPLACE FUNCTION public.cancel_reservation(
  p_reservation_id UUID
) RETURNS VOID AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_role TEXT;
  v_actor TEXT;
  v_outcome TEXT;
  v_rule TEXT;
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
    RAISE EXCEPTION 'Not authorized to cancel this reservation';
  END IF;

  IF v_res.status IN ('checked_in', 'checked_out') THEN
    RAISE EXCEPTION 'Cannot cancel after check-in';
  END IF;

  v_actor := CASE WHEN v_role = 'admin' THEN 'admin' ELSE 'guest' END;
  v_outcome := CASE WHEN v_role = 'admin' THEN 'refunded' ELSE 'forfeited' END;
  v_rule := COALESCE(
    v_res.deposit_rule_applied,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.service_bookings sb
        WHERE sb.reservation_id = v_res.reservation_id
      ) THEN 'tour_fixed_500_or_full_if_below_500'
      ELSE 'room_cottage_20pct_clamp_500_1000'
    END
  );

  UPDATE public.reservations
  SET status = 'cancelled',
      deposit_policy_version = COALESCE(v_res.deposit_policy_version, 'v1_2026_04'),
      deposit_rule_applied = v_rule,
      cancellation_actor = v_actor,
      policy_outcome = v_outcome
  WHERE reservation_id = p_reservation_id;

  PERFORM public.create_audit_log(
    'reservation',
    p_reservation_id::TEXT,
    'cancel',
    encode(
      digest(
        concat(p_reservation_id::TEXT, v_actor, v_outcome, COALESCE(v_res.deposit_required, 0)::TEXT, NOW()::TEXT),
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object(
      'reservation_code', v_res.reservation_code,
      'cancellation_actor', v_actor,
      'policy_outcome', v_outcome,
      'deposit_policy_version', COALESCE(v_res.deposit_policy_version, 'v1_2026_04'),
      'deposit_rule_applied', v_rule,
      'deposit_required', v_res.deposit_required,
      'amount_paid_verified', v_res.amount_paid_verified
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
