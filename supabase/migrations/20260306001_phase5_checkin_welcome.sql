-- ============================================
-- Phase 5: check-in settlement + welcome notification
-- Created: 2026-03-06
-- Purpose:
-- 1) Track non-blocking escrow release retries after check-in
-- 2) Persist in-app guest welcome notifications with AI suggestions
-- ============================================

-- ============================================
-- Reservations escrow settlement tracking
-- ============================================
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS escrow_release_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_release_last_attempt_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS escrow_release_last_error TEXT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_escrow_state_check'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations
      DROP CONSTRAINT reservations_escrow_state_check;
  END IF;
END$$;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_escrow_state_check
  CHECK (escrow_state IN ('none', 'pending_lock', 'locked', 'pending_release', 'released', 'refunded', 'failed'));

CREATE INDEX IF NOT EXISTS idx_reservations_escrow_state_chain_updated
  ON public.reservations (escrow_state, chain_key, updated_at DESC);

-- ============================================
-- Guest welcome notifications
-- ============================================
CREATE TABLE IF NOT EXISTS public.guest_welcome_notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
  guest_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'checkin_welcome',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NULL,
  source TEXT NOT NULL DEFAULT 'hillside-ai',
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guest_welcome_notifications_event_type_check'
      AND conrelid = 'public.guest_welcome_notifications'::regclass
  ) THEN
    ALTER TABLE public.guest_welcome_notifications
      ADD CONSTRAINT guest_welcome_notifications_event_type_check
      CHECK (event_type IN ('checkin_welcome'));
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_welcome_notifications_reservation_event
  ON public.guest_welcome_notifications (reservation_id, event_type);

CREATE INDEX IF NOT EXISTS idx_guest_welcome_notifications_guest_created
  ON public.guest_welcome_notifications (guest_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guest_welcome_notifications_reservation_created
  ON public.guest_welcome_notifications (reservation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guest_welcome_notifications_read_at
  ON public.guest_welcome_notifications (read_at);

ALTER TABLE public.guest_welcome_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_welcome_select_own" ON public.guest_welcome_notifications;
DROP POLICY IF EXISTS "guest_welcome_update_read_own" ON public.guest_welcome_notifications;
DROP POLICY IF EXISTS "guest_welcome_admin_read_all" ON public.guest_welcome_notifications;

CREATE POLICY "guest_welcome_select_own" ON public.guest_welcome_notifications
  FOR SELECT
  USING (auth.uid() = guest_user_id);

CREATE POLICY "guest_welcome_update_read_own" ON public.guest_welcome_notifications
  FOR UPDATE
  USING (auth.uid() = guest_user_id)
  WITH CHECK (auth.uid() = guest_user_id);

CREATE POLICY "guest_welcome_admin_read_all" ON public.guest_welcome_notifications
  FOR SELECT
  USING (public.is_admin());
