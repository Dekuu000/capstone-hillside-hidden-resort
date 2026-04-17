-- ============================================
-- Reservation source tracking
-- Created: 2026-03-09
-- Purpose:
-- 1) Distinguish online vs walk-in reservations in one unified table
-- 2) Support deterministic source-aware filters in admin flows
-- ============================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reservation_source TEXT NOT NULL DEFAULT 'online';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_reservation_source_check'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_reservation_source_check
      CHECK (reservation_source IN ('online', 'walk_in'));
  END IF;
END$$;

-- Backfill likely walk-ins from notes and on-site payment evidence.
UPDATE public.reservations
SET reservation_source = 'walk_in'
WHERE lower(coalesce(notes, '')) LIKE '%walk-in%'
   OR lower(coalesce(notes, '')) LIKE '%walk in%';

UPDATE public.reservations r
SET reservation_source = 'walk_in'
WHERE EXISTS (
  SELECT 1
  FROM public.payments p
  WHERE p.reservation_id = r.reservation_id
    AND p.payment_type = 'on_site'
);

CREATE INDEX IF NOT EXISTS idx_reservations_source_created
  ON public.reservations (reservation_source, created_at DESC);
