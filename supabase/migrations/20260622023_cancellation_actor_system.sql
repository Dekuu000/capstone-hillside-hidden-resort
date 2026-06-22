-- Allow 'system' as a cancellation actor so the auto-release of expired holds can
-- record that it was system-initiated (not guest/admin). Simple statements.

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_cancellation_actor_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_cancellation_actor_check
  CHECK (cancellation_actor IN ('guest', 'admin', 'system') OR cancellation_actor IS NULL);
