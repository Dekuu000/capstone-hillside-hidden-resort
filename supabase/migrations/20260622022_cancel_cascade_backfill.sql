-- One-time backfill: mark service bookings cancelled where their reservation was
-- already cancelled before the cascade existed. Idempotent. Simple statement.

UPDATE public.service_bookings sb
SET status = 'cancelled'
FROM public.reservations r
WHERE r.reservation_id = sb.reservation_id
  AND r.status = 'cancelled'
  AND sb.status NOT IN ('cancelled', 'no_show', 'checked_in');
