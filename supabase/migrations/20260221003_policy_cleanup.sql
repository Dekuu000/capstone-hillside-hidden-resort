-- ============================================
-- Policy cleanup after security hardening
-- Created: 2026-02-21
-- Purpose:
-- Remove legacy duplicate policies so only canonical policies remain.
-- Note: RLS policies are OR-combined; stale permissive policies can weaken controls.
-- ============================================

-- Users: keep canonical policies from 20260205_001 + trigger-based role-change guard
DROP POLICY IF EXISTS "users_can_insert_own_profile" ON public.users;
DROP POLICY IF EXISTS "users_can_read_own_profile" ON public.users;
DROP POLICY IF EXISTS "users_can_update_own_profile" ON public.users;

-- Units: keep `anyone_can_read_active_units` + admin_* policies only
DROP POLICY IF EXISTS "units_read_active" ON public.units;
