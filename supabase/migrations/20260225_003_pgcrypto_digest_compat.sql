-- ============================================
-- pgcrypto digest compatibility for SECURITY DEFINER search_path hardening
-- Created: 2026-02-25
-- Purpose:
-- 1) Ensure pgcrypto extension exists in `extensions` schema
-- 2) Provide public.digest(...) wrappers so functions with search_path=public,pg_temp can resolve digest()
-- ============================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.digest(data TEXT, type TEXT)
RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT extensions.digest(data, type);
$$;

CREATE OR REPLACE FUNCTION public.digest(data BYTEA, type TEXT)
RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT extensions.digest(data, type);
$$;

GRANT EXECUTE ON FUNCTION public.digest(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.digest(BYTEA, TEXT) TO authenticated, service_role;
