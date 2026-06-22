-- ============================================
-- Security Hardening: Lock down audit_logs writes
-- Created: 2026-06-19
-- Purpose: Close the forgeable audit-log INSERT path.
--
-- Background:
--   The original audit_logs INSERT policy used WITH CHECK (true)
--   (see 20260207006_audit_logs.sql), which let ANY authenticated user
--   insert arbitrary audit rows directly via PostgREST -- including
--   forging performed_by_user_id, data_hash, and blockchain_tx_hash on
--   records that are later SHA-256 hashed and anchored on-chain. That
--   undermines the integrity guarantee the audit trail is meant to provide.
--
--   All LEGITIMATE writes bypass RLS and are UNAFFECTED by this change:
--     * service-role API inserts (e.g. ai/pricing/apply audit write)
--     * the SECURITY DEFINER create_audit_log() helper
--     * the audit_reservation_update() trigger (calls create_audit_log)
--     * SECURITY DEFINER anchoring (create_audit_anchor_batch)
--   This mirrors the table's existing immutability policies
--   (no_update_audit_logs / no_delete_audit_logs), which already use
--   USING (false) / WITH CHECK (false) while DEFINER / service-role paths
--   continue to write.
-- ============================================

-- 1. Remove the permissive direct-insert policy.
DROP POLICY IF EXISTS "system_insert_audit_logs" ON public.audit_logs;

-- 2. Deny all direct (JWT-scoped) inserts. Privileged paths
--    (service_role + SECURITY DEFINER functions) bypass RLS and remain
--    the only way to write audit rows.
CREATE POLICY "no_direct_insert_audit_logs" ON public.audit_logs
  FOR INSERT
  WITH CHECK (false);

COMMENT ON POLICY "no_direct_insert_audit_logs" ON public.audit_logs IS
'Audit rows may only be created by privileged server paths (service-role
inserts and SECURITY DEFINER functions such as create_audit_log and the
reservation-status trigger). Authenticated end users cannot insert audit
rows directly via PostgREST, preventing forgery of performed_by_user_id,
data_hash, or blockchain_tx_hash.';

-- 3. Defense in depth: restrict the create_audit_log() helper to the
--    service role. NOTE: Supabase grants EXECUTE on new functions to the
--    anon and authenticated roles via ALTER DEFAULT PRIVILEGES, so a plain
--    REVOKE ... FROM PUBLIC is NOT enough -- those grants are explicit and
--    must be revoked by name. The function is SECURITY DEFINER, so the
--    reservation-status trigger (itself SECURITY DEFINER, owned by the same
--    role) still calls it successfully; only ad-hoc PostgREST RPC calls
--    from end users are blocked. Mirrors the lockdown used for
--    create_audit_anchor_batch (see 20260212001_phase7_audit_anchors.sql).
REVOKE EXECUTE ON FUNCTION public.create_audit_log(TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_audit_log(TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;
