-- ============================================
-- Phase 3/4: Enforce Unique Units by (name, type)
-- Created: 2026-02-07
-- Purpose: Prevent duplicate unit definitions
-- ============================================

-- NOTE: Run duplicate cleanup BEFORE applying this constraint.
-- See cleanup query previously shared.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'units_name_type_unique'
      AND conrelid = 'public.units'::regclass
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_name_type_unique UNIQUE (name, type);
  END IF;
END$$;
