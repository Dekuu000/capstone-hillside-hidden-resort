-- Re-grant EXECUTE on the new 11-arg create_reservation_atomic (the old grant was
-- dropped with the old signature in 20260622005). Single statement on purpose.

GRANT EXECUTE ON FUNCTION public.create_reservation_atomic(
  UUID, DATE, DATE, UUID[], NUMERIC[], NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT
) TO authenticated;
