-- ============================================
-- Policy + escrow alignment (v1_2026_04)
-- Created: 2026-04-18
-- ============================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS deposit_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS deposit_rule_applied TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_actor TEXT,
  ADD COLUMN IF NOT EXISTS policy_outcome TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_cancellation_actor_check'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_cancellation_actor_check
      CHECK (cancellation_actor IN ('guest', 'admin') OR cancellation_actor IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_policy_outcome_check'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_policy_outcome_check
      CHECK (policy_outcome IN ('released', 'refunded', 'forfeited') OR policy_outcome IS NULL);
  END IF;
END $$;

UPDATE public.reservations r
SET deposit_policy_version = 'v1_2026_04'
WHERE deposit_policy_version IS NULL;

UPDATE public.reservations r
SET deposit_rule_applied = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.service_bookings sb
    WHERE sb.reservation_id = r.reservation_id
  ) THEN 'tour_fixed_500_or_full_if_below_500'
  ELSE 'room_cottage_20pct_clamp_500_1000'
END
WHERE deposit_rule_applied IS NULL;

UPDATE public.reservations
SET policy_outcome = 'released'
WHERE policy_outcome IS NULL
  AND status IN ('checked_in', 'checked_out')
  AND escrow_state = 'released';
