-- Re-apply execution grants after the drop/recreate: only the backend (service
-- role) may trigger the auto-release; guests must not be able to mass-cancel holds.

REVOKE EXECUTE ON FUNCTION public.release_expired_holds(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_holds(integer) TO service_role;
