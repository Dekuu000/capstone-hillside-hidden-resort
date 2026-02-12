-- ============================================
-- Phase 7: Audit Anchors (Blockchain Root Hash)
-- Created: 2026-02-12
-- Purpose: Store batch anchors + link audit logs
-- ============================================

-- ====================
-- Audit Anchors Table
-- ====================

CREATE TABLE IF NOT EXISTS public.audit_anchors (
  anchor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_type TEXT NOT NULL,          -- 'manual_batch'
  scope TEXT NOT NULL,                -- 'critical_only'
  range_start TIMESTAMPTZ NOT NULL,
  range_end TIMESTAMPTZ NOT NULL,
  log_count INTEGER NOT NULL,
  root_hash TEXT NOT NULL,            -- lowercase hex, no 0x
  tx_hash TEXT,
  chain_id TEXT NOT NULL,             -- '11155111'
  status TEXT NOT NULL,               -- 'pending'|'submitted'|'confirmed'|'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ
);

ALTER TABLE public.audit_anchors ENABLE ROW LEVEL SECURITY;

-- Admins can read anchors
CREATE POLICY "admins_read_audit_anchors" ON public.audit_anchors
  FOR SELECT
  USING (public.is_admin());

-- ====================
-- Link audit_logs to anchors
-- ====================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS anchor_id UUID REFERENCES public.audit_anchors(anchor_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_anchor_id ON public.audit_logs(anchor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_anchors_status_created ON public.audit_anchors(status, created_at);

-- Optional: only one active anchor at a time
CREATE UNIQUE INDEX IF NOT EXISTS audit_anchors_one_active
  ON public.audit_anchors ((status))
  WHERE status IN ('pending','submitted');

-- ====================
-- Atomic batch creation + linking
-- ====================

CREATE OR REPLACE FUNCTION public.create_audit_anchor_batch(
  p_anchor_type TEXT,
  p_scope TEXT,
  p_range_start TIMESTAMPTZ,
  p_range_end TIMESTAMPTZ,
  p_log_count INTEGER,
  p_root_hash TEXT,
  p_chain_id TEXT,
  p_audit_ids UUID[]
) RETURNS UUID AS $$
DECLARE
  v_anchor_id UUID;
  v_updated INTEGER;
  v_expected INTEGER;
BEGIN
  v_expected := COALESCE(array_length(p_audit_ids, 1), 0);
  IF v_expected = 0 OR p_log_count IS NULL OR p_log_count <= 0 THEN
    RAISE EXCEPTION 'No audit logs provided for anchoring';
  END IF;
  IF p_log_count != v_expected THEN
    RAISE EXCEPTION 'Log count mismatch for anchor batch';
  END IF;

  INSERT INTO public.audit_anchors (
    anchor_type,
    scope,
    range_start,
    range_end,
    log_count,
    root_hash,
    chain_id,
    status
  ) VALUES (
    p_anchor_type,
    p_scope,
    p_range_start,
    p_range_end,
    p_log_count,
    p_root_hash,
    p_chain_id,
    'pending'
  ) RETURNING anchor_id INTO v_anchor_id;

  UPDATE public.audit_logs
  SET anchor_id = v_anchor_id
  WHERE audit_id = ANY(p_audit_ids)
    AND anchor_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated != v_expected THEN
    RAISE EXCEPTION 'Failed to link all audit logs for anchor';
  END IF;

  RETURN v_anchor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_audit_anchor_batch FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_audit_anchor_batch TO service_role;
