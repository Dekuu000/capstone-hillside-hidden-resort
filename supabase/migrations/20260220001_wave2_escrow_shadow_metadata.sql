-- ============================================
-- Wave 2: Escrow shadow-write metadata columns
-- Created: 2026-02-20
-- Purpose: persist chain metadata for reservation escrow shadow-write
-- ============================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS escrow_state TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS chain_key TEXT,
  ADD COLUMN IF NOT EXISTS chain_id INTEGER,
  ADD COLUMN IF NOT EXISTS escrow_contract_address TEXT,
  ADD COLUMN IF NOT EXISTS chain_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS onchain_booking_id TEXT,
  ADD COLUMN IF NOT EXISTS escrow_event_index INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_escrow_state_check'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_escrow_state_check
      CHECK (escrow_state IN ('none', 'pending_lock', 'locked', 'released', 'refunded', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservations_escrow_state
  ON public.reservations (escrow_state);

CREATE INDEX IF NOT EXISTS idx_reservations_chain_tx_hash
  ON public.reservations (chain_tx_hash)
  WHERE chain_tx_hash IS NOT NULL;
