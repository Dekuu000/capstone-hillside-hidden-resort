-- Drop the old 9-arg tour RPC so the 10-arg version (with p_promo_code, in
-- 20260622013) replaces it cleanly. Dropping removes its grant, re-added in
-- 20260622014. Single statement on purpose.

DROP FUNCTION IF EXISTS public.create_tour_reservation_atomic(
  UUID, UUID, DATE, INTEGER, INTEGER, BOOLEAN, NUMERIC, NUMERIC, TEXT
);
