-- ============================================
-- In-app notifications (guest + back-office)
-- Created: 2026-06-22
-- Purpose:
--   One row per recipient (fan-out for back-office role targeting), so RLS and
--   the bell/panel logic stay uniform: a user sees and marks read only their own
--   rows. Written server-side via the service role from emit points.
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  category TEXT NOT NULL,            -- reservation | payment | service | checkin | ops | system
  event_type TEXT NOT NULL,          -- e.g. reservation.confirmed, payment.declined, ops.payment_proof
  title TEXT NOT NULL,
  body TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'info',  -- info | success | warning | critical
  entity_type TEXT NULL,             -- reservation | payment | service_request | ...
  entity_id TEXT NULL,
  link TEXT NULL,                    -- in-app deep link, e.g. /my-bookings or /admin/payments?...
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT NULL,              -- optional idempotency key per recipient
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_severity_check'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_severity_check
      CHECK (severity IN ('info', 'success', 'warning', 'critical'));
  END IF;
END$$;

-- Idempotency: the same logical event never duplicates for one recipient.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_dedupe
  ON public.notifications (recipient_user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT
  USING (auth.uid() = recipient_user_id);

-- Recipients may only flip their own read state (the API still scopes columns).
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = recipient_user_id);

-- No INSERT policy on purpose: rows are created only by the service role
-- (emit points), never directly by clients.
