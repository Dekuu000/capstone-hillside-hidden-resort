-- ====================
-- Reservation creation RPC (stay)
-- Deposit rule:
--   20% of total, clamped PHP 500-1000
-- ====================
-- Return shape changed in this migration, so we must drop first.
DO $$
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.create_reservation_atomic(UUID, DATE, DATE, UUID[], NUMERIC[], NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT)';
END $$;
