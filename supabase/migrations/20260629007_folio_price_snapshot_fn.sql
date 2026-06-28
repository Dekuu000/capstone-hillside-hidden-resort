-- ============================================
-- Guest folio, part 1b: price-snapshot trigger function
-- Created: 2026-06-29
-- Locks the add-on price onto the request at creation (and recomputes line_total
-- if quantity changes) so the folio is stable against later catalog price edits.
-- SECURITY DEFINER so it can read resort_services past RLS regardless of which
-- client (guest user-scoped, sync, admin) inserted the request.
-- ============================================

CREATE OR REPLACE FUNCTION public.snapshot_service_request_price()
RETURNS TRIGGER AS $snap_fn$
DECLARE
  v_price NUMERIC(10,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT price INTO v_price FROM public.resort_services
      WHERE service_item_id = NEW.service_item_id;
    NEW.unit_price := COALESCE(v_price, 0);
    NEW.line_total := NEW.unit_price * COALESCE(NEW.quantity, 1);
  ELSIF TG_OP = 'UPDATE' AND NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    -- keep the snapshotted unit_price; just re-extend the line total
    NEW.line_total := NEW.unit_price * COALESCE(NEW.quantity, 1);
  END IF;
  RETURN NEW;
END;
$snap_fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
