-- ============================================
-- is_operations(): RLS helper for the operations tier (Front Desk and up)
-- Created: 2026-06-29
-- is_admin() is intentionally Manager+ (role IN ('admin','super_admin')) and is
-- used across RLS as the Manager gate — do NOT widen it. Front Desk actions that
-- the API exposes via require_operations (e.g. the resort service-request queue)
-- need a separate tier check at the database. Mirrors is_admin() but includes
-- 'staff'. SECURITY DEFINER so it can read the caller's role past users RLS.
-- ============================================

CREATE OR REPLACE FUNCTION public.is_operations()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
      AND role IN ('staff', 'admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;
