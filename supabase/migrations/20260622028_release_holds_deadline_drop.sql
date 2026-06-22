-- Return-type change (adding hold_expired_at) requires dropping the old function
-- first; CREATE OR REPLACE cannot change a function's RETURNS TABLE shape.
-- Single-purpose file (drop only) so the Supabase CLI applies it cleanly.

DROP FUNCTION IF EXISTS public.release_expired_holds(integer);
