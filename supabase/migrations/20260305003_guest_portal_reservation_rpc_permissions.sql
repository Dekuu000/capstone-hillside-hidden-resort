-- ============================================
-- Guest portal reservation RPC signature cleanup
-- Created: 2026-03-05
-- Purpose:
-- 1) Remove legacy create_reservation_atomic overload (without guest_count)
-- 2) Grant execute on the new guest_count-aware signature
-- ============================================

DO $$
BEGIN
  EXECUTE '
    DROP FUNCTION IF EXISTS public.create_reservation_atomic(
      UUID,
      DATE,
      DATE,
      UUID[],
      NUMERIC[],
      NUMERIC,
      NUMERIC,
      NUMERIC,
      TEXT
    )
  ';

  IF to_regprocedure('public.create_reservation_atomic(UUID, DATE, DATE, UUID[], NUMERIC[], NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT)') IS NOT NULL THEN
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
        INTEGER,
        TEXT
      ) TO authenticated
    ';

    EXECUTE '
      REVOKE EXECUTE ON FUNCTION public.create_reservation_atomic(
        UUID,
        DATE,
        DATE,
        UUID[],
        NUMERIC[],
        NUMERIC,
        NUMERIC,
        NUMERIC,
        INTEGER,
        TEXT
      ) FROM anon
    ';
  END IF;
END;
$$;
