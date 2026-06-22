-- Add promo_discounts to the report functions. Adding a column to RETURNS TABLE
-- changes the return type, which CREATE OR REPLACE cannot do, so drop the three
-- functions first (recreated in 016-018, re-granted in 019). Simple statements.
-- Drop summary/monthly before daily since they call daily.

DROP FUNCTION IF EXISTS public.get_report_summary(DATE, DATE);
DROP FUNCTION IF EXISTS public.get_report_monthly(DATE, DATE);
DROP FUNCTION IF EXISTS public.get_report_daily(DATE, DATE);
