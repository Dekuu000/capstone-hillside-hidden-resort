-- ============================================
-- Fix function overload ambiguity for reservation RPCs
-- Created: 2026-02-19
-- Purpose: remove legacy overloads so named-arg RPC resolution is deterministic
-- ============================================

DO $$
BEGIN
  -- Legacy create_reservation_atomic overload (without p_expected_pay_now)
  EXECUTE '
    DROP FUNCTION IF EXISTS public.create_reservation_atomic(
      UUID,
      DATE,
      DATE,
      UUID[],
      NUMERIC[],
      NUMERIC,
      NUMERIC,
      TEXT
    )
  ';

  -- Legacy create_tour_reservation_atomic overload (without p_expected_pay_now)
  EXECUTE '
    DROP FUNCTION IF EXISTS public.create_tour_reservation_atomic(
      UUID,
      UUID,
      DATE,
      INTEGER,
      INTEGER,
      BOOLEAN,
      NUMERIC,
      TEXT
    )
  ';

  -- Keep grants explicit on the current signatures.
  IF to_regprocedure('public.create_reservation_atomic(UUID, DATE, DATE, UUID[], NUMERIC[], NUMERIC, NUMERIC, NUMERIC, TEXT)') IS NOT NULL THEN
    EXECUTE '
      GRANT EXECUTE ON FUNCTION public.create_reservation_atomic(
        UUID,
        DATE,
        DATE,
        UUID[],
        NUMERIC[],
        NUMERIC,
        NUMERIC,
        NUMERIC,
        TEXT
      ) TO authenticated
    ';
  END IF;

  IF to_regprocedure('public.create_tour_reservation_atomic(UUID, UUID, DATE, INTEGER, INTEGER, BOOLEAN, NUMERIC, NUMERIC, TEXT)') IS NOT NULL THEN
    EXECUTE '
      GRANT EXECUTE ON FUNCTION public.create_tour_reservation_atomic(
        UUID,
        UUID,
        DATE,
        INTEGER,
        INTEGER,
        BOOLEAN,
        NUMERIC,
        NUMERIC,
        TEXT
      ) TO authenticated
    ';
  END IF;
END;
$$;
