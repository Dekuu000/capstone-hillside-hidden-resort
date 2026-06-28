-- ============================================
-- Guest folio, part 1c: attach the price-snapshot trigger
-- Created: 2026-06-29
-- ============================================

DROP TRIGGER IF EXISTS trg_snapshot_service_request_price ON public.resort_service_requests;
CREATE TRIGGER trg_snapshot_service_request_price
  BEFORE INSERT OR UPDATE OF quantity ON public.resort_service_requests
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_service_request_price();
