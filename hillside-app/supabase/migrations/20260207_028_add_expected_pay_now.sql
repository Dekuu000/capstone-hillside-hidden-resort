-- ============================================
-- Phase 4: Store expected pay-now amount
-- Created: 2026-02-07
-- Purpose: Persist guest-selected pay-now for bookings
-- ============================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS expected_pay_now NUMERIC(10,2);
