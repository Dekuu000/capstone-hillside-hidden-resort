-- ============================================
-- Phase 4: Restrict reservations update policy
-- Created: 2026-02-07
-- Purpose: Prevent any authenticated user from updating any reservation
-- ============================================

DROP POLICY IF EXISTS "authenticated_update_reservations" ON public.reservations;

CREATE POLICY "owners_or_admins_update_reservations" ON public.reservations
  FOR UPDATE
  USING (
    auth.uid() = guest_user_id
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
