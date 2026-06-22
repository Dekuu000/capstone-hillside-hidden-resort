-- Auto no-show: flag confirmed bookings whose check-out date has passed (guest
-- never checked in) as no_show, forfeiting the deposit. Cascades to service
-- bookings and audits each. p_grace_days adds a buffer after check-out before
-- flagging (default 1). Returns the flagged rows so the caller can notify guests.
-- Only 'confirmed' is targeted: checked_in/out already showed up; pending_payment
-- is auto-released; for_verification is left to staff. Named tag.

CREATE OR REPLACE FUNCTION public.mark_expired_no_shows(p_grace_days integer DEFAULT 1)
RETURNS TABLE (reservation_id uuid, reservation_code text, guest_user_id uuid) AS $no_show$
DECLARE
  v_cutoff date := CURRENT_DATE - GREATEST(COALESCE(p_grace_days, 1), 0);
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT res.reservation_id AS rid, res.reservation_code AS rcode, res.guest_user_id AS guid
    FROM public.reservations res
    WHERE res.status = 'confirmed'
      AND res.check_out_date < v_cutoff
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.reservations
    SET status = 'no_show',
        cancellation_actor = 'system',
        policy_outcome = 'forfeited'
    WHERE reservations.reservation_id = rec.rid;

    UPDATE public.service_bookings
    SET status = 'no_show'
    WHERE service_bookings.reservation_id = rec.rid
      AND service_bookings.status NOT IN ('cancelled', 'no_show', 'checked_in', 'checked_out');

    PERFORM public.create_audit_log(
      'reservation',
      rec.rid::text,
      'update',
      encode(digest(concat(rec.rid::text, 'no_show', 'forfeited', NOW()::text), 'sha256'), 'hex'),
      jsonb_build_object(
        'reservation_code', rec.rcode,
        'new_status', 'no_show',
        'cancellation_actor', 'system',
        'policy_outcome', 'forfeited',
        'reason', 'no_show_after_checkout'
      )
    );

    reservation_id := rec.rid;
    reservation_code := rec.rcode;
    guest_user_id := rec.guid;
    RETURN NEXT;
  END LOOP;
END;
$no_show$ LANGUAGE plpgsql SECURITY DEFINER;
