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
) TO authenticated;
