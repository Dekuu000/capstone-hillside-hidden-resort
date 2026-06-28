-- ============================================
-- Escrow ledger (append-only deposit audit trail)
-- Created: 2026-06-28
-- Purpose:
--   The reservation row carries only the CURRENT escrow_state, overwritten in
--   place — so the history of a deposit (locked -> released / refunded /
--   forfeited) is lost. This append-only ledger records every money-moving
--   escrow transition (check-in release, cancellation refund/forfeit, no-show
--   forfeit) as an immutable, queryable financial record, in both shadow and
--   on-chain modes. Written server-side via the service role only; read by the
--   System-Admin escrow tooling. Never read directly by guests.
-- ============================================

CREATE TABLE IF NOT EXISTS public.escrow_ledger (
  ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
  reservation_code TEXT NULL,
  event TEXT NOT NULL CHECK (event IN ('lock', 'release', 'refund', 'forfeit')),
  escrow_state_from TEXT NULL,            -- escrow_state before the transition
  escrow_state_to TEXT NULL,              -- escrow_state after (may equal _from in shadow mode)
  policy_outcome TEXT NULL,               -- released | refunded | forfeited
  amount NUMERIC(12, 2) NULL,             -- pesos moved (deposit released / refunded / forfeited)
  reason TEXT NULL,                       -- check_in | guest_cancellation | admin_cancellation | no_show | ...
  actor_role TEXT NULL,                   -- guest | staff | admin | system
  actor_user_id UUID NULL REFERENCES public.users(user_id) ON DELETE SET NULL,
  chain_tx_hash TEXT NULL,                -- on-chain tx (or shadow-<uuid> in shadow mode)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_ledger_reservation_created
  ON public.escrow_ledger (reservation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escrow_ledger_created
  ON public.escrow_ledger (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escrow_ledger_event
  ON public.escrow_ledger (event);

-- Backend-only: enable RLS with no client policies, so anon/authenticated see
-- nothing. The service role (used by the FastAPI escrow tooling) bypasses RLS
-- and is the only writer/reader. This is an audit log — append only, never
-- mutated by clients.
ALTER TABLE public.escrow_ledger ENABLE ROW LEVEL SECURITY;
