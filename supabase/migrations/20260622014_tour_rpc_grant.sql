-- Re-grant EXECUTE on the new 10-arg tour RPC (old grant dropped with the old
-- signature in 20260622012). Single statement on purpose.

GRANT EXECUTE ON FUNCTION public.create_tour_reservation_atomic(
  UUID, UUID, DATE, INTEGER, INTEGER, BOOLEAN, NUMERIC, NUMERIC, TEXT, TEXT
) TO authenticated;
