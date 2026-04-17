-- ============================================
-- Atomic reservation RPC permissions + docs
-- Created: 2026-02-07
-- Purpose:
-- 1) Grant RPC usage to authenticated clients
-- 2) Keep anon blocked
-- 3) Attach function documentation
-- ============================================

DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.create_reservation_atomic(
    UUID,
    DATE,
    DATE,
    UUID[],
    NUMERIC[],
    NUMERIC,
    NUMERIC,
    TEXT
  ) TO authenticated;

  REVOKE EXECUTE ON FUNCTION public.create_reservation_atomic(
    UUID,
    DATE,
    DATE,
    UUID[],
    NUMERIC[],
    NUMERIC,
    NUMERIC,
    TEXT
  ) FROM anon;

  COMMENT ON FUNCTION public.create_reservation_atomic(
    UUID,
    DATE,
    DATE,
    UUID[],
    NUMERIC[],
    NUMERIC,
    NUMERIC,
    TEXT
  ) IS
  'Atomically creates a reservation with row-level locks to prevent race conditions.
Returns: reservation_id, reservation_code, status, message.
Throws exceptions with user-friendly messages on validation or availability failures.
Security: SECURITY DEFINER ensures consistent permissions regardless of caller.';
END;
$$;
