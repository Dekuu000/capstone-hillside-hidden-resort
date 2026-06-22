-- Data-lifecycle: delete notifications that are BOTH read and older than the
-- retention window (default 90 days). Unread notifications are never pruned,
-- regardless of age. Returns the number of rows deleted. Notifications are an
-- ephemeral messaging layer; the durable history lives in audit_log.
-- Named dollar-quote tag; no dollar tokens in comments.

CREATE OR REPLACE FUNCTION public.prune_read_notifications(p_retention_days integer DEFAULT 90)
RETURNS integer AS $prune_notifications$
DECLARE
  v_days integer := GREATEST(COALESCE(p_retention_days, 90), 1);
  v_deleted integer;
BEGIN
  WITH removed AS (
    DELETE FROM public.notifications
    WHERE read_at IS NOT NULL
      AND created_at < NOW() - make_interval(days => v_days)
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM removed;
  RETURN v_deleted;
END;
$prune_notifications$ LANGUAGE plpgsql SECURITY DEFINER;
