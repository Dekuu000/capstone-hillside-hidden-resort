-- ============================================
-- Service-request queue: read + update for the operations tier (Front Desk+)
-- Created: 2026-06-29
-- The queue endpoints (GET/PATCH /v2/admin/services/requests) are require_operations
-- (staff and up) and use the USER-SCOPED Supabase client, so RLS applies. The
-- policies gated on is_admin() (Manager+ only), so Front Desk saw an empty queue and
-- got 404 on status updates. Point the SELECT + UPDATE policies at is_operations()
-- (see 20260629004) so Front Desk can work the queue. DELETE stays Manager+
-- (is_admin) — not part of the queue workflow.
-- ============================================

DROP POLICY IF EXISTS "service_requests_admins_read_all" ON public.resort_service_requests;
CREATE POLICY "service_requests_admins_read_all" ON public.resort_service_requests
  FOR SELECT
  USING (public.is_operations());

DROP POLICY IF EXISTS "service_requests_admins_update" ON public.resort_service_requests;
CREATE POLICY "service_requests_admins_update" ON public.resort_service_requests
  FOR UPDATE
  USING (public.is_operations());
