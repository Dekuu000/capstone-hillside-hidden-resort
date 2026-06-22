-- Only the backend (service role) may run retention pruning; guests/authenticated
-- users must not be able to bulk-delete notifications.

REVOKE EXECUTE ON FUNCTION public.prune_read_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_read_notifications(integer) TO service_role;
