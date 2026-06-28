-- Auto no-show: also write an escrow-ledger forfeit entry per flagged booking,
-- so the AUTOMATED no-show path is audited like the manual one (Phase 5c).
-- Body-only change (same RETURNS signature) => plain CREATE OR REPLACE, and the
-- ledger INSERT is wrapped in its own block so a failed audit write can never
-- roll back / break the no-show flagging. Named tag.

CREATE OR REPLACE FUNCTION public.mark_expired_no_shows(p_grace_days integer DEFAULT 1)
RETURNS TABLE (reservation_id uuid, reservation_code text, guest_user_id uuid) AS $no_show$
DECLARE
  v_cutoff date := CURRENT_DATE - GREATEST(COALESCE(p_grace_days, 1), 0);
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT res.reservation_id AS rid,
           res.reservation_code AS rcode,
           res.guest_user_id AS guid,
           res.amount_paid_verified AS paid,
           res.escrow_state AS escrow
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

    -- Append-only escrow ledger (Phase 5c). Guarded so it never breaks flagging.
    BEGIN
      INSERT INTO public.escrow_ledger (
        reservation_id, reservation_code, event, escrow_state_from, escrow_state_to,
        policy_outcome, amount, reason, actor_role, metadata
      ) VALUES (
        rec.rid, rec.rcode, 'forfeit', COALESCE(rec.escrow, 'none'), COALESCE(rec.escrow, 'none'),
        'forfeited', COALESCE(rec.paid, 0), 'no_show', 'system',
        jsonb_build_object('auto', true)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    reservation_id := rec.rid;
    reservation_code := rec.rcode;
    guest_user_id := rec.guid;
    RETURN NEXT;
  END LOOP;
END;
$no_show$ LANGUAGE plpgsql SECURITY DEFINER;
