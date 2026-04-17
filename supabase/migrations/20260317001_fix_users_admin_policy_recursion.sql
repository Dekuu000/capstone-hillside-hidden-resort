-- ============================================
-- Fix users RLS recursion on admin read policy
-- Created: 2026-03-17
-- Purpose:
-- 1) Replace self-referencing users SELECT policy that can recurse
-- 2) Use public.is_admin() helper for admin read access
-- ============================================

DROP POLICY IF EXISTS "admins_read_all" ON public.users;

CREATE POLICY "admins_read_all" ON public.users
  FOR SELECT
  USING (public.is_admin());
