-- ============================================
-- Guest folio: record how an add-on charge was settled
-- Created: 2026-06-29
-- When staff settle the folio at check-out we stamp settled_at on each add-on
-- request; settled_method records the tender (cash/gcash/...) for the receipt.
-- ============================================

ALTER TABLE public.resort_service_requests
  ADD COLUMN IF NOT EXISTS settled_method TEXT;
