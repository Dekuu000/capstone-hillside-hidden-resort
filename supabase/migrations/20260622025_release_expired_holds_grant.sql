-- Only the backend (service role) may trigger the auto-release; guests/authenticated
-- users must not be able to mass-cancel holds. Simple statements.

REVOKE EXECUTE ON FUNCTION public.release_expired_holds(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_holds(integer) TO service_role;
