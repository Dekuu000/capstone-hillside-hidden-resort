-- Ensure sync changefeed trigger writes are not blocked by table RLS.
-- Guest writes (e.g. resort service requests) execute triggers as `authenticated`,
-- so this trigger function must run with definer privileges.
CREATE OR REPLACE FUNCTION public.emit_sync_change_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  record_json JSONB;
  primary_key_name TEXT := COALESCE(TG_ARGV[0], 'reservation_id');
  entity_id_text TEXT;
  version_num BIGINT;
  action_text TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    record_json := to_jsonb(OLD);
    action_text := 'delete';
  ELSIF TG_OP = 'UPDATE' THEN
    record_json := to_jsonb(NEW);
    action_text := 'update';
  ELSE
    record_json := to_jsonb(NEW);
    action_text := 'insert';
  END IF;

  entity_id_text := COALESCE(record_json ->> primary_key_name, '');
  version_num := COALESCE((record_json ->> 'sync_version')::BIGINT, 0);

  IF entity_id_text = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.sync_change_events (
    entity_type,
    entity_id,
    action,
    version,
    payload
  ) VALUES (
    TG_TABLE_NAME,
    entity_id_text,
    action_text,
    version_num,
    record_json
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
