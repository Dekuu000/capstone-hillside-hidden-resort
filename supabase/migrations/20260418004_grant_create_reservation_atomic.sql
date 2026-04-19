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
) TO authenticated;
