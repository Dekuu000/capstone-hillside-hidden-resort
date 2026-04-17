-- ============================================
-- AI concierge suggestions persistence
-- Created: 2026-03-02
-- Purpose:
-- 1) Persist anonymized concierge recommendation outputs for demo traceability
-- 2) Keep PII out of AI suggestion storage
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_concierge_suggestions (
  suggestion_run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  segment_key TEXT NOT NULL,
  stay_type TEXT NULL,
  model_version TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'hillside-ai',
  behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id UUID REFERENCES public.users(user_id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_concierge_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_ai_concierge_suggestions" ON public.ai_concierge_suggestions;
DROP POLICY IF EXISTS "admins_insert_ai_concierge_suggestions" ON public.ai_concierge_suggestions;

CREATE POLICY "admins_read_ai_concierge_suggestions" ON public.ai_concierge_suggestions
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_ai_concierge_suggestions" ON public.ai_concierge_suggestions
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_ai_concierge_suggestions_created_at
  ON public.ai_concierge_suggestions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_concierge_suggestions_segment
  ON public.ai_concierge_suggestions (segment_key, created_at DESC);

