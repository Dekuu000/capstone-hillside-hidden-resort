-- ====================
-- Tour reservation creation RPC
-- Deposit rule:
--   fixed PHP 500, or full amount when total < PHP 500
-- ====================
-- Return shape changed in this migration, so we must drop first.
DO $$
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.create_tour_reservation_atomic(UUID, UUID, DATE, INTEGER, INTEGER, BOOLEAN, NUMERIC, NUMERIC, TEXT)';
END $$;
