-- ============================================
-- Offline-first sync foundation
-- Created: 2026-03-16
-- Purpose:
-- 1) Add deterministic revision metadata for syncable entities
-- 2) Add operation receipts for idempotent replay
-- 3) Add append-only sync changefeed table for delta pull
-- 4) Add upload lifecycle table for offline file commit handshake
-- ============================================

-- --------------------------------------------
-- Revision metadata on high-traffic tables
-- --------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.resort_service_requests
  ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.checkin_logs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 1;

UPDATE public.reservations
SET sync_version = 1
WHERE sync_version IS NULL;

UPDATE public.payments
SET sync_version = 1
WHERE sync_version IS NULL;

UPDATE public.resort_service_requests
SET sync_version = 1
WHERE sync_version IS NULL;

UPDATE public.checkin_logs
SET sync_version = 1
WHERE sync_version IS NULL;

CREATE OR REPLACE FUNCTION public.bump_sync_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sync_version := COALESCE(OLD.sync_version, 0) + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reservations_sync_version ON public.reservations;
CREATE TRIGGER reservations_sync_version
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.bump_sync_version();

DROP TRIGGER IF EXISTS payments_updated_at ON public.payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS payments_sync_version ON public.payments;
CREATE TRIGGER payments_sync_version
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.bump_sync_version();

DROP TRIGGER IF EXISTS resort_service_requests_sync_version ON public.resort_service_requests;
CREATE TRIGGER resort_service_requests_sync_version
  BEFORE UPDATE ON public.resort_service_requests
  FOR EACH ROW EXECUTE FUNCTION public.bump_sync_version();

DROP TRIGGER IF EXISTS checkin_logs_updated_at ON public.checkin_logs;
CREATE TRIGGER checkin_logs_updated_at
  BEFORE UPDATE ON public.checkin_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS checkin_logs_sync_version ON public.checkin_logs;
CREATE TRIGGER checkin_logs_sync_version
  BEFORE UPDATE ON public.checkin_logs
  FOR EACH ROW EXECUTE FUNCTION public.bump_sync_version();

CREATE INDEX IF NOT EXISTS idx_reservations_updated_sync
  ON public.reservations (updated_at DESC, sync_version DESC);

CREATE INDEX IF NOT EXISTS idx_payments_updated_sync
  ON public.payments (updated_at DESC, sync_version DESC);

CREATE INDEX IF NOT EXISTS idx_service_requests_updated_sync
  ON public.resort_service_requests (updated_at DESC, sync_version DESC);

CREATE INDEX IF NOT EXISTS idx_checkin_logs_updated_sync
  ON public.checkin_logs (updated_at DESC, sync_version DESC);

-- --------------------------------------------
-- Idempotency receipts for sync replay
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_operation_receipts (
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'conflict', 'failed', 'noop')),
  http_status INTEGER NOT NULL DEFAULT 200,
  conflict BOOLEAN NOT NULL DEFAULT FALSE,
  server_version BIGINT,
  resolution_hint TEXT,
  error_code TEXT,
  error_message TEXT,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_receipts_user_key
  ON public.sync_operation_receipts (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_sync_receipts_entity
  ON public.sync_operation_receipts (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_receipts_created
  ON public.sync_operation_receipts (created_at DESC);

DROP TRIGGER IF EXISTS sync_operation_receipts_updated_at ON public.sync_operation_receipts;
CREATE TRIGGER sync_operation_receipts_updated_at
  BEFORE UPDATE ON public.sync_operation_receipts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.sync_operation_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_receipts_service_role_only" ON public.sync_operation_receipts;
CREATE POLICY "sync_receipts_service_role_only" ON public.sync_operation_receipts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- --------------------------------------------
-- Changefeed table for cursor-based sync pull
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_change_events (
  event_id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  version BIGINT NOT NULL DEFAULT 0,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sync_events_cursor
  ON public.sync_change_events (event_id ASC);

CREATE INDEX IF NOT EXISTS idx_sync_events_entity
  ON public.sync_change_events (entity_type, changed_at DESC);

ALTER TABLE public.sync_change_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_events_service_role_only" ON public.sync_change_events;
CREATE POLICY "sync_events_service_role_only" ON public.sync_change_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.emit_sync_change_event()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_emit_reservations ON public.reservations;
CREATE TRIGGER sync_emit_reservations
  AFTER INSERT OR UPDATE OR DELETE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.emit_sync_change_event('reservation_id');

DROP TRIGGER IF EXISTS sync_emit_payments ON public.payments;
CREATE TRIGGER sync_emit_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.emit_sync_change_event('payment_id');

DROP TRIGGER IF EXISTS sync_emit_resort_service_requests ON public.resort_service_requests;
CREATE TRIGGER sync_emit_resort_service_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.resort_service_requests
  FOR EACH ROW EXECUTE FUNCTION public.emit_sync_change_event('request_id');

DROP TRIGGER IF EXISTS sync_emit_checkin_logs ON public.checkin_logs;
CREATE TRIGGER sync_emit_checkin_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.checkin_logs
  FOR EACH ROW EXECUTE FUNCTION public.emit_sync_change_event('checkin_log_id');

-- --------------------------------------------
-- Offline upload lifecycle metadata
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_upload_items (
  upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  checksum_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'uploaded', 'committed', 'failed')),
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_upload_items_path
  ON public.sync_upload_items (storage_bucket, storage_path);

CREATE INDEX IF NOT EXISTS idx_sync_upload_items_status
  ON public.sync_upload_items (status, updated_at DESC);

DROP TRIGGER IF EXISTS sync_upload_items_updated_at ON public.sync_upload_items;
CREATE TRIGGER sync_upload_items_updated_at
  BEFORE UPDATE ON public.sync_upload_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.sync_upload_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_uploads_service_role_only" ON public.sync_upload_items;
CREATE POLICY "sync_uploads_service_role_only" ON public.sync_upload_items
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
