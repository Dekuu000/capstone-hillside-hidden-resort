-- ============================================
-- Phase 3: Reservations + Reservation Units Tables
-- ============================================

-- Create reservations table
CREATE TABLE IF NOT EXISTS public.reservations (
  reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_code TEXT UNIQUE NOT NULL,
  guest_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (
    status IN (
      'pending_payment',   -- Guest has selected units, awaiting payment
      'for_verification',  -- Payment uploaded, awaiting admin verification
      'confirmed',         -- Payment verified, reservation is confirmed
      'checked_in',        -- Guest has checked in
      'checked_out',       -- Guest has checked out
      'cancelled',         -- Reservation cancelled
      'no_show'           -- Guest did not check in
    )
  ),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit_required NUMERIC(10,2) DEFAULT 0,
  amount_paid_verified NUMERIC(10,2) DEFAULT 0,
  balance_due NUMERIC(10,2) GENERATED ALWAYS AS (total_amount - amount_paid_verified) STORED,
  hold_expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure check_out is after check_in
  CONSTRAINT valid_dates CHECK (check_out_date > check_in_date)
);

-- Create reservation_units junction table
CREATE TABLE IF NOT EXISTS public.reservation_units (
  reservation_unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(unit_id) ON DELETE RESTRICT,
  rate_snapshot NUMERIC(10,2) NOT NULL,
  quantity_or_nights INTEGER NOT NULL DEFAULT 1
);

-- ============================================
-- Row Level Security Policies
-- ============================================

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_units ENABLE ROW LEVEL SECURITY;

-- Reservations: Guests can read their own reservations
CREATE POLICY "guests_read_own_reservations" ON public.reservations
  FOR SELECT USING (auth.uid() = guest_user_id);

-- Reservations: Authenticated users can read all (for admins)
CREATE POLICY "authenticated_read_all_reservations" ON public.reservations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Reservations: Authenticated users can create reservations
CREATE POLICY "authenticated_insert_reservations" ON public.reservations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Reservations: Authenticated users can update reservations
CREATE POLICY "authenticated_update_reservations" ON public.reservations
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Reservation Units: Read access
CREATE POLICY "authenticated_read_reservation_units" ON public.reservation_units
  FOR SELECT USING (auth.role() = 'authenticated');

-- Reservation Units: Insert/Update access
CREATE POLICY "authenticated_insert_reservation_units" ON public.reservation_units
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_update_reservation_units" ON public.reservation_units
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_delete_reservation_units" ON public.reservation_units
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_reservations_guest ON public.reservations(guest_user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON public.reservations(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_code ON public.reservations(reservation_code);
CREATE INDEX IF NOT EXISTS idx_reservation_units_res ON public.reservation_units(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_units_unit ON public.reservation_units(unit_id);

-- ============================================
-- Auto-update timestamp trigger
-- ============================================

CREATE TRIGGER reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Function: Generate Unique Reservation Code
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_reservation_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    -- Generate code: HR-YYYYMMDD-XXXX (HR = Hillside Resort)
    code := 'HR-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FOR 4));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.reservations WHERE reservation_code = code) INTO exists_check;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT exists_check;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function: Check Unit Availability (no overlaps)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_unit_availability(
  p_unit_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_exclude_reservation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM public.reservation_units ru
  JOIN public.reservations r ON r.reservation_id = ru.reservation_id
  WHERE ru.unit_id = p_unit_id
    AND r.status NOT IN ('cancelled', 'no_show', 'checked_out')
    AND r.check_in_date < p_check_out
    AND r.check_out_date > p_check_in
    AND (p_exclude_reservation_id IS NULL OR r.reservation_id != p_exclude_reservation_id);
  
  RETURN conflict_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: Get Available Units for Date Range
-- ============================================

CREATE OR REPLACE FUNCTION public.get_available_units(
  p_check_in DATE,
  p_check_out DATE,
  p_unit_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  unit_id UUID,
  name TEXT,
  type TEXT,
  description TEXT,
  base_price NUMERIC,
  capacity INTEGER,
  image_url TEXT,
  amenities TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.unit_id,
    u.name,
    u.type,
    u.description,
    u.base_price,
    u.capacity,
    u.image_url,
    u.amenities
  FROM public.units u
  WHERE u.is_active = true
    AND (p_unit_type IS NULL OR u.type = p_unit_type)
    AND NOT EXISTS (
      SELECT 1 
      FROM public.reservation_units ru
      JOIN public.reservations r ON r.reservation_id = ru.reservation_id
      WHERE ru.unit_id = u.unit_id
        AND r.status NOT IN ('cancelled', 'no_show', 'checked_out')
        AND r.check_in_date < p_check_out
        AND r.check_out_date > p_check_in
    )
  ORDER BY u.type, u.base_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
