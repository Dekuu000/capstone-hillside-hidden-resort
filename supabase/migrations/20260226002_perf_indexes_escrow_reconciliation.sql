-- ============================================
-- Wave 3 escrow reconciliation indexes
-- Created: 2026-02-26
-- Purpose: reduce latency for /v2/escrow/reconciliation and cleanup-shadow
-- ============================================

-- Main reconciliation list query:
-- WHERE chain_key = ?
--   AND escrow_state IN (...)
-- ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_reservations_escrow_recon_main
  ON public.reservations (chain_key, escrow_state, created_at DESC);

-- Targeted helper for cleanup-shadow candidate scan:
-- WHERE chain_key = ?
--   AND escrow_state = 'pending_lock'
--   AND chain_tx_hash LIKE 'shadow-%'
-- ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_reservations_escrow_shadow_cleanup
  ON public.reservations (chain_key, created_at DESC)
  WHERE escrow_state = 'pending_lock' AND chain_tx_hash LIKE 'shadow-%';

