-- ============================================
-- V2 performance indexes (API + Next.js migration)
-- Created: 2026-02-19
-- Purpose: reduce latency on auth-scoped list and reservation/payment workflows
-- ============================================

-- Guest bookings list (user scoped, recent-first)
CREATE INDEX IF NOT EXISTS idx_reservations_guest_created
  ON public.reservations (guest_user_id, created_at DESC, reservation_id DESC);

-- Upcoming tab and status-driven admin/guest list filters
CREATE INDEX IF NOT EXISTS idx_reservations_status_dates
  ON public.reservations (status, check_in_date, check_out_date, created_at DESC);

-- Fast reservation access for payment and status transitions
CREATE INDEX IF NOT EXISTS idx_reservations_status_created
  ON public.reservations (status, created_at DESC, reservation_id DESC);

-- Reservation -> unit joins (details view)
CREATE INDEX IF NOT EXISTS idx_reservation_units_reservation
  ON public.reservation_units (reservation_id);

-- Reservation -> service joins (tour details view)
CREATE INDEX IF NOT EXISTS idx_service_bookings_reservation
  ON public.service_bookings (reservation_id);

-- Payment history + verification queries
CREATE INDEX IF NOT EXISTS idx_payments_reservation_status_created
  ON public.payments (reservation_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON public.payments (status, created_at DESC);
