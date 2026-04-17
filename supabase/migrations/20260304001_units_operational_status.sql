-- ============================================
-- Module D: explicit unit operational status
-- Created: 2026-03-04
-- Purpose:
-- 1) Track room lifecycle states for dashboard accuracy
-- 2) Separate bookable flag (is_active) from housekeeping state
-- ============================================

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'cleaned';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'units_operational_status_check'
      AND conrelid = 'public.units'::regclass
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_operational_status_check
      CHECK (operational_status IN ('cleaned', 'occupied', 'maintenance', 'dirty'));
  END IF;
END$$;

-- Backfill based on active/inactive and current check-in state.
UPDATE public.units
SET operational_status = CASE
  WHEN is_active = false THEN 'maintenance'
  ELSE 'cleaned'
END;

UPDATE public.units u
SET operational_status = 'occupied'
FROM public.reservation_units ru
JOIN public.reservations r
  ON r.reservation_id = ru.reservation_id
WHERE u.unit_id = ru.unit_id
  AND u.operational_status <> 'maintenance'
  AND r.status = 'checked_in';

CREATE INDEX IF NOT EXISTS idx_units_operational_status
  ON public.units (operational_status);

CREATE INDEX IF NOT EXISTS idx_units_active_operational
  ON public.units (is_active, operational_status);
