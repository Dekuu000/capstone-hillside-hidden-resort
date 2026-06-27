-- Reports: surface refunded + forfeited deposits.
-- Adding return columns changes each function's return type, so the existing
-- functions must be dropped before the new CREATE. DROPs live in their own file
-- (the CLI statement splitter chokes when a $$-function body shares a file with
-- other statements). Drop dependents (summary, monthly) before the base (daily).
DROP FUNCTION IF EXISTS public.get_report_summary(DATE, DATE);
DROP FUNCTION IF EXISTS public.get_report_monthly(DATE, DATE);
DROP FUNCTION IF EXISTS public.get_report_daily(DATE, DATE);
