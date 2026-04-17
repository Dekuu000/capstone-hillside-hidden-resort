-- ============================================
-- Wave 3 performance indexes (API list + audit + check-in)
-- Created: 2026-02-26
-- Purpose: reduce latency on audit logs, check-ins, and payment/admin queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp_desc
  ON public.audit_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_checkin_logs_reservation_time
  ON public.checkin_logs (reservation_id, checkin_time DESC);

CREATE INDEX IF NOT EXISTS idx_payments_created_at_desc
  ON public.payments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_bookings_visit_date
  ON public.service_bookings (visit_date);
