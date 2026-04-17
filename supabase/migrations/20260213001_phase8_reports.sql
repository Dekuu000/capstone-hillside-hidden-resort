-- ============================================
-- Phase 8: Reports + Analytics (Aggregated, No PII)
-- Created: 2026-02-13
-- Purpose: Provide admin-only reporting RPCs (daily, monthly, summary)
-- ============================================

-- ============================================================
-- Daily report (date, bookings, cancellations, revenue, etc.)
-- Revenue basis: verified + on-site payments (actual cash collected)
-- Occupancy: units booked / total active units per day
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_report_daily(
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  report_date DATE,
  bookings INTEGER,
  cancellations INTEGER,
  cash_collected NUMERIC,
  occupancy_rate NUMERIC,
  unit_booked_value NUMERIC,
  tour_booked_value NUMERIC
) AS $$
DECLARE
  v_active_units INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start and end dates are required';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Start date must be before end date';
  END IF;

  SELECT COUNT(*) INTO v_active_units
  FROM public.units
  WHERE is_active = true;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(p_start_date, p_end_date, interval '1 day')::date AS day
  ),
  bookings AS (
    SELECT r.check_in_date::date AS day, COUNT(*)::int AS cnt
    FROM public.reservations r
    WHERE r.check_in_date BETWEEN p_start_date AND p_end_date
      AND r.status NOT IN ('cancelled', 'no_show')
    GROUP BY r.check_in_date
  ),
  cancels AS (
    SELECT r.check_in_date::date AS day, COUNT(*)::int AS cnt
    FROM public.reservations r
    WHERE r.check_in_date BETWEEN p_start_date AND p_end_date
      AND r.status = 'cancelled'
    GROUP BY r.check_in_date
  ),
  cash AS (
    SELECT p.created_at::date AS day, COALESCE(SUM(p.amount), 0) AS total
    FROM public.payments p
    WHERE p.status = 'verified'
      AND p.payment_type IN ('deposit', 'full', 'on_site')
      AND p.created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY p.created_at::date
  ),
  unit_value AS (
    SELECT r.check_in_date::date AS day,
           COALESCE(SUM(ru.rate_snapshot * ru.quantity_or_nights), 0) AS total
    FROM public.reservations r
    JOIN public.reservation_units ru ON ru.reservation_id = r.reservation_id
    WHERE r.check_in_date BETWEEN p_start_date AND p_end_date
      AND r.status NOT IN ('cancelled', 'no_show')
    GROUP BY r.check_in_date
  ),
  tour_value AS (
    SELECT sb.visit_date::date AS day,
           COALESCE(SUM(sb.total_amount), 0) AS total
    FROM public.service_bookings sb
    WHERE sb.visit_date BETWEEN p_start_date AND p_end_date
      AND sb.status NOT IN ('cancelled', 'no_show')
    GROUP BY sb.visit_date
  ),
  occupancy AS (
    SELECT d.day,
           CASE
             WHEN v_active_units = 0 THEN 0
             ELSE (
               SELECT COUNT(DISTINCT ru.unit_id)::numeric
               FROM public.reservations r
               JOIN public.reservation_units ru ON ru.reservation_id = r.reservation_id
               JOIN public.units u ON u.unit_id = ru.unit_id AND u.is_active = true
               WHERE r.status NOT IN ('cancelled', 'no_show')
                 AND r.check_in_date <= d.day
                 AND r.check_out_date > d.day
             ) / v_active_units::numeric
           END AS rate
    FROM days d
  )
  SELECT
    d.day AS report_date,
    COALESCE(b.cnt, 0) AS bookings,
    COALESCE(c.cnt, 0) AS cancellations,
    COALESCE(cash.total, 0) AS cash_collected,
    COALESCE(o.rate, 0) AS occupancy_rate,
    COALESCE(uv.total, 0) AS unit_booked_value,
    COALESCE(tv.total, 0) AS tour_booked_value
  FROM days d
  LEFT JOIN bookings b ON b.day = d.day
  LEFT JOIN cancels c ON c.day = d.day
  LEFT JOIN cash ON cash.day = d.day
  LEFT JOIN unit_value uv ON uv.day = d.day
  LEFT JOIN tour_value tv ON tv.day = d.day
  LEFT JOIN occupancy o ON o.day = d.day
  ORDER BY d.day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_report_daily(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_daily(DATE, DATE) TO authenticated;

-- ============================================================
-- Monthly report (aggregate from daily report)
-- ============================================================
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
    date_trunc('month', report_date)::date AS report_month,
    SUM(bookings)::int AS bookings,
    SUM(cancellations)::int AS cancellations,
    SUM(cash_collected) AS cash_collected,
    AVG(occupancy_rate) AS occupancy_rate,
    SUM(unit_booked_value) AS unit_booked_value,
    SUM(tour_booked_value) AS tour_booked_value
  FROM public.get_report_daily(p_start_date, p_end_date)
  GROUP BY 1
  ORDER BY 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_report_monthly(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_monthly(DATE, DATE) TO authenticated;

-- ============================================================
-- Summary report (single row)
-- ============================================================
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
    SUM(bookings)::int AS bookings,
    SUM(cancellations)::int AS cancellations,
    SUM(cash_collected) AS cash_collected,
    AVG(occupancy_rate) AS occupancy_rate,
    SUM(unit_booked_value) AS unit_booked_value,
    SUM(tour_booked_value) AS tour_booked_value
  FROM public.get_report_daily(p_start_date, p_end_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_report_summary(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_summary(DATE, DATE) TO authenticated;

