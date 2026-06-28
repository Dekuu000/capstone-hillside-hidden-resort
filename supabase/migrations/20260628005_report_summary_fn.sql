-- get_report_summary + refunded_deposits / forfeited_deposits (sum the daily
-- columns). Named tag.

CREATE OR REPLACE FUNCTION public.get_report_summary(
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  bookings INTEGER,
  cancellations INTEGER,
  cash_collected NUMERIC,
  occupancy_rate NUMERIC,
  unit_booked_value NUMERIC,
  tour_booked_value NUMERIC,
  promo_discounts NUMERIC,
  refunded_deposits NUMERIC,
  forfeited_deposits NUMERIC
) AS $report_summary$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    SUM(d.bookings)::int AS bookings,
    SUM(d.cancellations)::int AS cancellations,
    SUM(d.cash_collected) AS cash_collected,
    AVG(d.occupancy_rate) AS occupancy_rate,
    SUM(d.unit_booked_value) AS unit_booked_value,
    SUM(d.tour_booked_value) AS tour_booked_value,
    SUM(d.promo_discounts) AS promo_discounts,
    SUM(d.refunded_deposits) AS refunded_deposits,
    SUM(d.forfeited_deposits) AS forfeited_deposits
  FROM public.get_report_daily(p_start_date, p_end_date) AS d;
END;
$report_summary$ LANGUAGE plpgsql SECURITY DEFINER;
