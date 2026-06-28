-- ============================================
-- Payments: PayMongo (GCash) hosted-checkout references
-- Created: 2026-06-24
-- Purpose: track the PayMongo checkout session / payment ids on a payment row so
--          the webhook can reconcile a "paid" event back to our payment record.
--          Reuses the existing payments table + status values (gateway "paid"
--          maps to our existing "verified" status); no new tables.
-- ============================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS paymongo_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS paymongo_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paymongo_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS paymongo_checkout_url TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_paymongo_checkout_session_id
  ON public.payments (paymongo_checkout_session_id);
