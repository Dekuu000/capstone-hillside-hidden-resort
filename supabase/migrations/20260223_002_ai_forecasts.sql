-- ============================================
-- AI occupancy forecast persistence
-- Created: 2026-02-23
-- Purpose:
-- 1) Persist occupancy forecast runs/results for auditability
-- 2) Keep forecast inputs/outputs queryable for dashboard usage
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_forecasts (
  forecast_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  forecast_type TEXT NOT NULL CHECK (forecast_type IN ('occupancy')),
  start_date DATE NOT NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 30),
  model_version TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'hillside-ai',
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  series JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id UUID REFERENCES public.users(user_id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_ai_forecasts" ON public.ai_forecasts;
DROP POLICY IF EXISTS "admins_insert_ai_forecasts" ON public.ai_forecasts;

CREATE POLICY "admins_read_ai_forecasts" ON public.ai_forecasts
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_ai_forecasts" ON public.ai_forecasts
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_ai_forecasts_created_at
  ON public.ai_forecasts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_forecasts_type_start
  ON public.ai_forecasts (forecast_type, start_date DESC);
