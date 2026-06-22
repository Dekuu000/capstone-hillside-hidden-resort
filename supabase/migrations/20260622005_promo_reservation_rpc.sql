-- Drop the old 10-arg create_reservation_atomic so the 11-arg version (with
-- p_promo_code, in 20260622006) replaces it cleanly instead of creating a second
-- overload. Dropping also removes its grant, re-added in 20260622007.
-- Kept in its own file so the Supabase CLI statement splitter never mixes this
-- with the large dollar-quoted function body.

DROP FUNCTION IF EXISTS public.create_reservation_atomic(
  UUID, DATE, DATE, UUID[], NUMERIC[], NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT
);
