-- ============================================
-- NFT Guest Pass metadata columns
-- Created: 2026-02-23
-- Purpose:
-- 1) Persist guest-pass mint metadata for reservation rows
-- 2) Keep PII off-chain by storing only reservation hash + token refs
-- ============================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS guest_pass_token_id BIGINT,
  ADD COLUMN IF NOT EXISTS guest_pass_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS guest_pass_chain_key TEXT,
  ADD COLUMN IF NOT EXISTS guest_pass_reservation_hash TEXT,
  ADD COLUMN IF NOT EXISTS guest_pass_minted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reservations_guest_pass_token_id
  ON public.reservations (guest_pass_token_id)
  WHERE guest_pass_token_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_guest_pass_chain_key
  ON public.reservations (guest_pass_chain_key)
  WHERE guest_pass_chain_key IS NOT NULL;
