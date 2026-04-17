-- ============================================
-- Phase 4: Ticketed Services + Service Bookings
-- Created: 2026-02-07
-- Purpose: Support day/night tour ticketing
-- ============================================

-- ====================
-- Services (master data)
-- ====================

CREATE TABLE IF NOT EXISTS public.services (
  service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('day_tour', 'night_tour')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  adult_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  kid_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  kid_age_rule TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  capacity_limit INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT services_unique_name_type UNIQUE (service_name, service_type)
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Read: anyone can read active services
CREATE POLICY "anyone_read_active_services" ON public.services
  FOR SELECT
  USING (status = 'active');

-- Read: admins can read all services
CREATE POLICY "admins_read_all_services" ON public.services
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Write: admins only
CREATE POLICY "admins_insert_services" ON public.services
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admins_update_services" ON public.services
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admins_delete_services" ON public.services
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_services_status ON public.services(status);
CREATE INDEX IF NOT EXISTS idx_services_type ON public.services(service_type);

-- updated_at trigger
CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed services (idempotent)
WITH seed_services AS (
  SELECT * FROM (VALUES
    ('Day Tour', 'day_tour', '08:00:00'::time, '17:00:00'::time, 100.00, 80.00, '5U'),
    ('Night Tour', 'night_tour', '15:00:00'::time, '22:00:00'::time, 120.00, 100.00, '5U')
  ) AS v(service_name, service_type, start_time, end_time, adult_rate, kid_rate, kid_age_rule)
)
INSERT INTO public.services (
  service_name, service_type, start_time, end_time, adult_rate, kid_rate, kid_age_rule, status
)
SELECT s.service_name, s.service_type, s.start_time, s.end_time, s.adult_rate, s.kid_rate, s.kid_age_rule, 'active'
FROM seed_services s
WHERE NOT EXISTS (
  SELECT 1 FROM public.services p
  WHERE p.service_name = s.service_name AND p.service_type = s.service_type
);

-- ====================
-- Service bookings (tickets)
-- ====================

CREATE TABLE IF NOT EXISTS public.service_bookings (
  service_booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(service_id) ON DELETE RESTRICT,
  reservation_id UUID NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
  guest_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  visit_date DATE NOT NULL,
  adult_qty INTEGER NOT NULL DEFAULT 0 CHECK (adult_qty >= 0),
  kid_qty INTEGER NOT NULL DEFAULT 0 CHECK (kid_qty >= 0),
  adult_rate_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0,
  kid_rate_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (
    status IN ('pending_payment', 'for_verification', 'confirmed', 'checked_in', 'cancelled', 'no_show')
  ),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;

-- Read: guests can read their own bookings
CREATE POLICY "guests_read_own_service_bookings" ON public.service_bookings
  FOR SELECT USING (auth.uid() = guest_user_id);

-- Read: admins can read all
CREATE POLICY "admins_read_all_service_bookings" ON public.service_bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Insert: guests for themselves or admins for anyone
CREATE POLICY "authenticated_insert_service_bookings" ON public.service_bookings
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      guest_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.users
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- Update/Delete: admins only
CREATE POLICY "admins_update_service_bookings" ON public.service_bookings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admins_delete_service_bookings" ON public.service_bookings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_bookings_service ON public.service_bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_service_bookings_reservation ON public.service_bookings(reservation_id);
CREATE INDEX IF NOT EXISTS idx_service_bookings_guest ON public.service_bookings(guest_user_id);
CREATE INDEX IF NOT EXISTS idx_service_bookings_visit_date ON public.service_bookings(visit_date);
