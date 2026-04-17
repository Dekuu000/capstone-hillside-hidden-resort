-- ============================================
-- AI pricing suggestions persistence
-- Created: 2026-03-02
-- Purpose:
-- 1) Persist pricing recommendation outputs for audit/demo traceability
-- 2) Keep response payload anonymized and queryable
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_pricing_suggestions (
  suggestion_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id UUID NULL REFERENCES public.reservations(reservation_id) ON DELETE SET NULL,
  segment_key TEXT NULL,
  check_in_date DATE NULL,
  check_out_date DATE NULL,
  visit_date DATE NULL,
  suggested_multiplier NUMERIC(8,4) NULL,
  demand_bucket TEXT NULL CHECK (demand_bucket IN ('low', 'normal', 'high')),
  pricing_adjustment NUMERIC(12,2) NOT NULL,
  confidence NUMERIC(6,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  model_version TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'hillside-ai',
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanations JSONB NOT NULL DEFAULT '[]'::jsonb,
  signal_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES public.users(user_id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_pricing_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_ai_pricing_suggestions" ON public.ai_pricing_suggestions;
DROP POLICY IF EXISTS "admins_insert_ai_pricing_suggestions" ON public.ai_pricing_suggestions;

CREATE POLICY "admins_read_ai_pricing_suggestions" ON public.ai_pricing_suggestions
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_ai_pricing_suggestions" ON public.ai_pricing_suggestions
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_ai_pricing_suggestions_created_at
  ON public.ai_pricing_suggestions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_pricing_suggestions_reservation
  ON public.ai_pricing_suggestions (reservation_id, created_at DESC);

