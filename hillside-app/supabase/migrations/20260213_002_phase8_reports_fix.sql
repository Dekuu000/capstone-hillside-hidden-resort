-- ============================================
-- Phase 8: Reports fix (ambiguous column)
-- Created: 2026-02-13
-- Purpose: Qualify columns in report aggregations
-- ============================================

-- Fix monthly report (qualify columns)
CREATE OR REPLACE FUNCTION public.get_report_monthly(
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  report_month DATE,
  bookings INTEGER,
  cancellations INTEGER,
  cash_collected NUMERIC,
  occupancy_rate NUMERIC,
  unit_booked_value NUMERIC,
  tour_booked_value NUMERIC
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    date_trunc('month', d.report_date)::date AS report_month,
    SUM(d.bookings)::int AS bookings,
    SUM(d.cancellations)::int AS cancellations,
    SUM(d.cash_collected) AS cash_collected,
    AVG(d.occupancy_rate) AS occupancy_rate,
    SUM(d.unit_booked_value) AS unit_booked_value,
    SUM(d.tour_booked_value) AS tour_booked_value
  FROM public.get_report_daily(p_start_date, p_end_date) AS d
  GROUP BY 1
  ORDER BY 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_report_monthly(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_monthly(DATE, DATE) TO authenticated;

-- Fix summary report (qualify columns)
CREATE OR REPLACE FUNCTION public.get_report_summary(
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  bookings INTEGER,
  cancellations INTEGER,
  cash_collected NUMERIC,
  occupancy_rate NUMERIC,
  unit_booked_value NUMERIC,
  tour_booked_value NUMERIC
) AS $$
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
    SUM(d.tour_booked_value) AS tour_booked_value
  FROM public.get_report_daily(p_start_date, p_end_date) AS d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_report_summary(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_summary(DATE, DATE) TO authenticated;

