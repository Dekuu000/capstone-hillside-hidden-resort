-- ============================================
-- Security hardening pass (Wave 5 closeout)
-- Created: 2026-02-21
-- Purpose:
-- 1) Prevent role escalation on signup/profile update
-- 2) Tighten units RLS to admin-only writes
-- 3) Lock down qr_tokens direct table access
-- 4) Set explicit search_path on SECURITY DEFINER functions
-- ============================================

-- ====================
-- 1) Users hardening
-- ====================

-- Never trust raw_user_meta_data.role at signup.
-- All new users are created as guest; admin promotion is explicit/manual.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (user_id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Guest User'),
    'guest'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Prevent non-admin role changes through direct profile updates.
CREATE OR REPLACE FUNCTION public.prevent_non_admin_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_prevent_role_change ON public.users;
CREATE TRIGGER users_prevent_role_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_non_admin_role_change();

-- Reduce callable surface for privileged helpers.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ====================
-- 2) Units RLS hardening
-- ====================

-- Replace legacy permissive authenticated write policies with admin-only policies.
DROP POLICY IF EXISTS "authenticated_can_read_all_units" ON public.units;
DROP POLICY IF EXISTS "authenticated_can_insert_units" ON public.units;
DROP POLICY IF EXISTS "authenticated_can_update_units" ON public.units;
DROP POLICY IF EXISTS "authenticated_can_delete_units" ON public.units;
DROP POLICY IF EXISTS "admins_read_all_units" ON public.units;
DROP POLICY IF EXISTS "admins_insert_units" ON public.units;
DROP POLICY IF EXISTS "admins_update_units" ON public.units;
DROP POLICY IF EXISTS "admins_delete_units" ON public.units;

-- Keep public read for active units.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'units'
      AND policyname = 'anyone_can_read_active_units'
  ) THEN
    CREATE POLICY "anyone_can_read_active_units" ON public.units
      FOR SELECT
      USING (is_active = true);
  END IF;
END$$;

CREATE POLICY "admins_read_all_units" ON public.units
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admins_insert_units" ON public.units
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_update_units" ON public.units
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admins_delete_units" ON public.units
  FOR DELETE
  USING (public.is_admin());

-- ====================
-- 3) QR token table hardening
-- ====================

ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_select_qr_tokens" ON public.qr_tokens;
DROP POLICY IF EXISTS "no_direct_insert_qr_tokens" ON public.qr_tokens;
DROP POLICY IF EXISTS "no_direct_update_qr_tokens" ON public.qr_tokens;
DROP POLICY IF EXISTS "no_direct_delete_qr_tokens" ON public.qr_tokens;

-- QR tokens are intended to be managed via RPC/API (service role path), not direct client table access.
CREATE POLICY "no_direct_select_qr_tokens" ON public.qr_tokens
  FOR SELECT
  USING (false);

CREATE POLICY "no_direct_insert_qr_tokens" ON public.qr_tokens
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "no_direct_update_qr_tokens" ON public.qr_tokens
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "no_direct_delete_qr_tokens" ON public.qr_tokens
  FOR DELETE
  USING (false);

-- ====================
-- 4) SECURITY DEFINER search_path hardening
-- ====================

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
  END LOOP;
END$$;
