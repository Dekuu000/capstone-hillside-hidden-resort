-- Re-apply the report function grants (dropped with the old signatures in 015).
-- Simple statements only.

REVOKE ALL ON FUNCTION public.get_report_daily(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_daily(DATE, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.get_report_monthly(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_monthly(DATE, DATE) TO authenticated;

REVOKE ALL ON FUNCTION public.get_report_summary(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_summary(DATE, DATE) TO authenticated;
