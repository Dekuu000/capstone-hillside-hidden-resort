-- Auto-release unpaid holds: cancel pending_payment reservations created more than
-- p_window_minutes ago (default 120 = 2 hours), cascade to their service bookings,
-- and audit each. Now also computes and returns each reservation's true expiry
-- deadline (created_at + window) so the caller can stamp the audit log and guest
-- message with WHEN the hold actually lapsed, not when this job happened to run.
-- Named dollar-quote tag; no dollar tokens in comments.

CREATE OR REPLACE FUNCTION public.release_expired_holds(p_window_minutes integer DEFAULT 120)
RETURNS TABLE (reservation_id uuid, reservation_code text, guest_user_id uuid, hold_expired_at timestamptz) AS $release_holds$
DECLARE
  v_window integer := GREATEST(COALESCE(p_window_minutes, 120), 1);
  v_cutoff timestamptz := NOW() - make_interval(mins => v_window);
  rec RECORD;
  v_deadline timestamptz;
BEGIN
  FOR rec IN
    SELECT res.reservation_id AS rid, res.reservation_code AS rcode,
           res.guest_user_id AS guid, res.created_at AS rcreated
    FROM public.reservations res
    WHERE res.status = 'pending_payment'
      AND res.created_at < v_cutoff
    FOR UPDATE SKIP LOCKED
  LOOP
    v_deadline := rec.rcreated + make_interval(mins => v_window);

    UPDATE public.reservations
    SET status = 'cancelled',
        cancellation_actor = 'system',
        policy_outcome = 'released'
    WHERE reservations.reservation_id = rec.rid;

    UPDATE public.service_bookings
    SET status = 'cancelled'
    WHERE service_bookings.reservation_id = rec.rid
      AND service_bookings.status NOT IN ('cancelled', 'no_show', 'checked_in');

    PERFORM public.create_audit_log(
      'reservation',
      rec.rid::text,
      'cancel',
      encode(digest(concat(rec.rid::text, 'system', 'released', NOW()::text), 'sha256'), 'hex'),
      jsonb_build_object(
        'reservation_code', rec.rcode,
        'cancellation_actor', 'system',
        'policy_outcome', 'released',
        'reason', 'hold_expired',
        'hold_expired_at', v_deadline
      )
    );

    reservation_id := rec.rid;
    reservation_code := rec.rcode;
    guest_user_id := rec.guid;
    hold_expired_at := v_deadline;
    RETURN NEXT;
  END LOOP;
END;
$release_holds$ LANGUAGE plpgsql SECURITY DEFINER;
