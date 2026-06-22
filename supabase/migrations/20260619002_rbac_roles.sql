-- ============================================
-- Back-office roles (RBAC): Front Desk / Manager / System Admin
-- Created: 2026-06-19
-- Purpose:
--   Split the single back-office "admin" role into nested tiers.
--   guest < staff (Front Desk) < admin (Manager) < super_admin (System Admin).
--   "admin" is KEPT as the Manager role so every existing role='admin' check
--   (RLS policies, RPC internals, login routing) keeps working unchanged.
-- ============================================

-- 1. Allow the two new roles. (Existing rows stay 'admin'/'guest'.)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('guest', 'staff', 'admin', 'super_admin'));

-- 2. super_admin inherits everything admin can do. is_admin() is used across RLS
--    policies and by the login is_admin() RPC, so this single change makes the
--    System Admin a superset of the Manager at the database layer.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- 3. Allow role assignment from a service-role / SQL-editor context (auth.uid()
--    is NULL there) so roles can be seeded manually, while still blocking
--    authenticated non-admins from escalating their own role.
CREATE OR REPLACE FUNCTION public.prevent_non_admin_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
