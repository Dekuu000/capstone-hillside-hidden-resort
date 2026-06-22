-- Only the backend (service role) may run the bulk auto no-show pass. Simple
-- statements. (Manual single no-show goes through the existing admin status
-- endpoint, which is separately guarded.)

REVOKE EXECUTE ON FUNCTION public.mark_expired_no_shows(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_expired_no_shows(integer) TO service_role;
