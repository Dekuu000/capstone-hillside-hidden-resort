-- ============================================
-- Guest folio, part 1a: chargeable add-on columns on service requests
-- Created: 2026-06-29
-- A fulfilled (status='done') service request with a price becomes a charge on the
-- guest's folio, collected at check-out. We snapshot the catalog price at request
-- time (trigger in 20260629007/008) so later catalog edits never change a past
-- charge. settled_at/settlement_payment_id mark it paid; waived marks a comp.
-- A request is "billable" when: status='done' AND line_total>0 AND settled_at IS
-- NULL AND NOT waived.
-- ============================================

ALTER TABLE public.resort_service_requests
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_payment_id UUID,
  ADD COLUMN IF NOT EXISTS waived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS waived_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS waived_at TIMESTAMPTZ;

-- Backfill existing requests from the current catalog price (one-time; only rows
-- still at the default 0 so re-running is safe).
UPDATE public.resort_service_requests req
SET unit_price = rs.price,
    line_total = rs.price * req.quantity
FROM public.resort_services rs
WHERE rs.service_item_id = req.service_item_id
  AND req.unit_price = 0
  AND rs.price > 0;

-- Folio lookups: open (billable, unsettled) charges per reservation.
CREATE INDEX IF NOT EXISTS idx_service_requests_reservation_billable
  ON public.resort_service_requests (reservation_id)
  WHERE status = 'done' AND settled_at IS NULL AND waived = FALSE;
