-- ============================================
-- Module E: Guest portal upgrades (room identity, guest count, wallet profile, services)
-- Created: 2026-03-05
-- ============================================

-- ====================
-- Units: room identity fields
-- ====================
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS unit_code TEXT,
  ADD COLUMN IF NOT EXISTS room_number TEXT;

WITH normalized AS (
  SELECT
    u.unit_id,
    COALESCE(NULLIF(UPPER(REGEXP_REPLACE(TRIM(u.name), '[^A-Za-z0-9]+', '-', 'g')), ''), CONCAT('UNIT-', LEFT(u.unit_id::text, 8))) AS base_code,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(UPPER(REGEXP_REPLACE(TRIM(u.name), '[^A-Za-z0-9]+', '-', 'g')), ''), CONCAT('UNIT-', LEFT(u.unit_id::text, 8)))
      ORDER BY u.created_at, u.unit_id
    ) AS seq
  FROM public.units u
)
UPDATE public.units u
SET unit_code = CASE
  WHEN n.seq = 1 THEN n.base_code
  ELSE CONCAT(n.base_code, '-', n.seq)
END
FROM normalized n
WHERE u.unit_id = n.unit_id
  AND (u.unit_code IS NULL OR LENGTH(TRIM(u.unit_code)) = 0);

UPDATE public.units
SET room_number = (REGEXP_MATCH(name, '([0-9]+)$'))[1]
WHERE room_number IS NULL
  AND type IN ('room', 'cottage')
  AND REGEXP_MATCH(name, '([0-9]+)$') IS NOT NULL;

ALTER TABLE public.units
  ALTER COLUMN unit_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_units_unit_code_unique
  ON public.units (unit_code);

CREATE INDEX IF NOT EXISTS idx_units_room_number
  ON public.units (room_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'units_room_number_format_check'
      AND conrelid = 'public.units'::regclass
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_room_number_format_check
      CHECK (
        room_number IS NULL
        OR room_number ~ '^[A-Za-z0-9-]+$'
      );
  END IF;
END$$;

-- ====================
-- Users: optional wallet profile
-- ====================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS wallet_chain TEXT NOT NULL DEFAULT 'evm';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_wallet_address_evm_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_wallet_address_evm_check
      CHECK (
        wallet_address IS NULL
        OR wallet_address ~ '^0x[0-9a-fA-F]{40}$'
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_wallet_chain_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_wallet_chain_check
      CHECK (wallet_chain IN ('evm'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_users_wallet_address
  ON public.users (wallet_address);

-- ====================
-- Reservations: guest count
-- ====================
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS guest_count INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_guest_count_check'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_guest_count_check
      CHECK (guest_count > 0);
  END IF;
END$$;

-- ====================
-- Digital resort services catalog
-- ====================
CREATE TABLE IF NOT EXISTS public.resort_services (
  service_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('room_service', 'spa')),
  service_name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  eta_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.resort_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resort_services_guests_read_active" ON public.resort_services;
DROP POLICY IF EXISTS "resort_services_admins_read_all" ON public.resort_services;
DROP POLICY IF EXISTS "resort_services_admins_insert" ON public.resort_services;
DROP POLICY IF EXISTS "resort_services_admins_update" ON public.resort_services;
DROP POLICY IF EXISTS "resort_services_admins_delete" ON public.resort_services;

CREATE POLICY "resort_services_guests_read_active" ON public.resort_services
  FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "resort_services_admins_read_all" ON public.resort_services
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "resort_services_admins_insert" ON public.resort_services
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "resort_services_admins_update" ON public.resort_services
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "resort_services_admins_delete" ON public.resort_services
  FOR DELETE
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_resort_services_category_active
  ON public.resort_services (category, is_active);

DROP TRIGGER IF EXISTS resort_services_updated_at ON public.resort_services;
CREATE TRIGGER resort_services_updated_at
  BEFORE UPDATE ON public.resort_services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.resort_services (category, service_name, description, price, eta_minutes, is_active)
SELECT * FROM (
  VALUES
    ('room_service', 'Continental Breakfast Tray', 'Bread basket, fruit, coffee, and juice.', 450.00, 30, TRUE),
    ('room_service', 'Family Lunch Set', 'Shared lunch set for 3-4 guests.', 1200.00, 45, TRUE),
    ('room_service', 'Late Night Snacks', 'Light snacks and drinks for evening orders.', 350.00, 20, TRUE),
    ('spa', 'Swedish Massage (60 min)', 'Full-body relaxation massage.', 1800.00, 90, TRUE),
    ('spa', 'Foot Reflexology (45 min)', 'Pressure-point foot therapy session.', 900.00, 60, TRUE),
    ('spa', 'Couple Spa Package', 'Dual treatment room with tea service.', 3200.00, 120, TRUE)
) AS v(category, service_name, description, price, eta_minutes, is_active)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.resort_services rs
  WHERE rs.category = v.category
    AND rs.service_name = v.service_name
);

-- ====================
-- Resort service requests
-- ====================
CREATE TABLE IF NOT EXISTS public.resort_service_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
  reservation_id UUID REFERENCES public.reservations(reservation_id) ON DELETE SET NULL,
  service_item_id UUID NOT NULL REFERENCES public.resort_services(service_item_id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  preferred_time TIMESTAMPTZ,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by_user_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.resort_service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_requests_guests_read_own" ON public.resort_service_requests;
DROP POLICY IF EXISTS "service_requests_guests_insert_own" ON public.resort_service_requests;
DROP POLICY IF EXISTS "service_requests_admins_read_all" ON public.resort_service_requests;
DROP POLICY IF EXISTS "service_requests_admins_update" ON public.resort_service_requests;
DROP POLICY IF EXISTS "service_requests_admins_delete" ON public.resort_service_requests;

CREATE POLICY "service_requests_guests_read_own" ON public.resort_service_requests
  FOR SELECT
  USING (auth.uid() = guest_user_id);

CREATE POLICY "service_requests_guests_insert_own" ON public.resort_service_requests
  FOR INSERT
  WITH CHECK (auth.uid() = guest_user_id);

CREATE POLICY "service_requests_admins_read_all" ON public.resort_service_requests
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "service_requests_admins_update" ON public.resort_service_requests
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "service_requests_admins_delete" ON public.resort_service_requests
  FOR DELETE
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_service_requests_guest_status
  ON public.resort_service_requests (guest_user_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_requests_status_requested
  ON public.resort_service_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_requests_reservation
  ON public.resort_service_requests (reservation_id);

DROP TRIGGER IF EXISTS resort_service_requests_updated_at ON public.resort_service_requests;
CREATE TRIGGER resort_service_requests_updated_at
  BEFORE UPDATE ON public.resort_service_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================
-- Update available units RPC contract to include room identity
-- ====================
DROP FUNCTION IF EXISTS public.get_available_units(DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.get_available_units(
  p_check_in DATE,
  p_check_out DATE,
  p_unit_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  unit_id UUID,
  name TEXT,
  unit_code TEXT,
  room_number TEXT,
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
    u.unit_code,
    u.room_number,
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

GRANT EXECUTE ON FUNCTION public.get_available_units(DATE, DATE, TEXT) TO authenticated;

-- ====================
-- Reservation creation RPC: include guest_count
-- ====================
CREATE OR REPLACE FUNCTION public.create_reservation_atomic(
  p_guest_user_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_unit_ids UUID[],
  p_rates NUMERIC[],
  p_total_amount NUMERIC,
  p_deposit_required NUMERIC DEFAULT NULL,
  p_expected_pay_now NUMERIC DEFAULT NULL,
  p_guest_count INTEGER DEFAULT 1,
  p_notes TEXT DEFAULT NULL
) RETURNS TABLE (
  reservation_id UUID,
  reservation_code TEXT,
  status TEXT,
  message TEXT
) AS $$
DECLARE
  v_reservation_id UUID;
  v_code TEXT;
  v_deposit NUMERIC;
  v_unit_id UUID;
  v_available BOOLEAN;
  v_nights INTEGER;
  i INTEGER;
  v_rates NUMERIC[];
  v_total NUMERIC := 0;
  v_has_pavilion BOOLEAN := FALSE;
  v_has_function_hall BOOLEAN := FALSE;
  v_has_room BOOLEAN := FALSE;
  v_has_cottage BOOLEAN := FALSE;
  v_role TEXT;
  v_expected_pay_now NUMERIC;
BEGIN
  IF p_check_in >= p_check_out THEN
    RAISE EXCEPTION 'Invalid dates: check-out must be after check-in'
      USING HINT = 'Please select a check-out date that is later than the check-in date';
  END IF;

  IF p_check_in < CURRENT_DATE THEN
    RAISE EXCEPTION 'Invalid dates: check-in must be in the future'
      USING HINT = 'Cannot create reservations for past dates';
  END IF;

  IF p_guest_count IS NULL OR p_guest_count <= 0 THEN
    RAISE EXCEPTION 'Guest count must be greater than zero'
      USING HINT = 'Please provide a valid number of guests';
  END IF;

  v_nights := (p_check_out - p_check_in)::INTEGER;
  IF v_nights > 30 THEN
    RAISE EXCEPTION 'Maximum stay is 30 nights. Current selection: % nights', v_nights;
  END IF;

  IF array_length(p_unit_ids, 1) IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No units selected'
      USING HINT = 'Please select at least one unit';
  END IF;

  IF array_length(p_unit_ids, 1) > 10 THEN
    RAISE EXCEPTION 'Maximum 10 units per reservation. Current selection: % units', array_length(p_unit_ids, 1);
  END IF;

  IF array_length(p_unit_ids, 1) != array_length(p_rates, 1) THEN
    RAISE EXCEPTION 'Mismatched units and rates arrays'
      USING HINT = 'System error. Please try again.';
  END IF;

  BEGIN
    PERFORM * FROM public.units
    WHERE unit_id = ANY(p_unit_ids)
    AND is_active = true
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RAISE EXCEPTION 'System busy processing this unit. Please try again in a moment.'
        USING HINT = 'Another reservation is being created for one of these units';
  END;

  IF (SELECT COUNT(*) FROM public.units WHERE unit_id = ANY(p_unit_ids) AND is_active = true)
     != array_length(p_unit_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected units are not available'
      USING HINT = 'Some units may have been deactivated. Please refresh and try again.';
  END IF;

  FOR i IN 1..array_length(p_unit_ids, 1) LOOP
    v_unit_id := p_unit_ids[i];
    SELECT public.check_unit_availability(v_unit_id, p_check_in, p_check_out, NULL)
    INTO v_available;
    IF NOT v_available THEN
      RAISE EXCEPTION 'Unit not available for selected dates'
        USING HINT = 'One or more units are already booked for these dates. Please select different dates or units.';
    END IF;
  END LOOP;

  SELECT array_agg(u.base_price ORDER BY x.ord)
  INTO v_rates
  FROM unnest(p_unit_ids) WITH ORDINALITY AS x(unit_id, ord)
  JOIN public.units u ON u.unit_id = x.unit_id AND u.is_active = true;

  IF v_rates IS NULL OR array_length(v_rates, 1) != array_length(p_unit_ids, 1) THEN
    RAISE EXCEPTION 'Invalid unit selection'
      USING HINT = 'Please refresh and try again.';
  END IF;

  v_total := 0;
  FOR i IN 1..array_length(v_rates, 1) LOOP
    v_total := v_total + (v_rates[i] * v_nights);
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount'
      USING HINT = 'Total amount must be greater than zero';
  END IF;

  SELECT
    bool_or(lower(u.name) LIKE '%pavilion%'),
    bool_or(lower(u.name) LIKE '%function hall%'),
    bool_or(u.type = 'room'),
    bool_or(u.type = 'cottage')
  INTO v_has_pavilion, v_has_function_hall, v_has_room, v_has_cottage
  FROM public.units u
  WHERE u.unit_id = ANY(p_unit_ids);

  v_deposit := CASE
    WHEN v_has_pavilion OR v_has_function_hall THEN 1000
    WHEN v_has_room THEN 1000
    WHEN v_has_cottage THEN 500
    ELSE 0
  END;

  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF p_deposit_required IS NOT NULL AND v_role = 'admin' THEN
    v_deposit := p_deposit_required;
  END IF;

  v_expected_pay_now := v_deposit;
  IF p_expected_pay_now IS NOT NULL THEN
    IF p_expected_pay_now < v_deposit OR p_expected_pay_now > v_total THEN
      RAISE EXCEPTION 'Expected pay now must be between % and %', v_deposit, v_total;
    END IF;
    v_expected_pay_now := p_expected_pay_now;
  END IF;

  v_code := public.generate_reservation_code();

  INSERT INTO public.reservations (
    reservation_code,
    guest_user_id,
    check_in_date,
    check_out_date,
    total_amount,
    deposit_required,
    expected_pay_now,
    amount_paid_verified,
    status,
    guest_count,
    notes,
    hold_expires_at
  ) VALUES (
    v_code,
    p_guest_user_id,
    p_check_in,
    p_check_out,
    v_total,
    v_deposit,
    v_expected_pay_now,
    0,
    'pending_payment',
    p_guest_count,
    p_notes,
    NOW() + INTERVAL '24 hours'
  ) RETURNING reservations.reservation_id INTO v_reservation_id;

  FOR i IN 1..array_length(p_unit_ids, 1) LOOP
    INSERT INTO public.reservation_units (
      reservation_id,
      unit_id,
      rate_snapshot,
      quantity_or_nights
    ) VALUES (
      v_reservation_id,
      p_unit_ids[i],
      v_rates[i],
      v_nights
    );
  END LOOP;

  INSERT INTO public.audit_logs (
    performed_by_user_id,
    entity_type,
    entity_id,
    action,
    data_hash,
    metadata
  ) VALUES (
    p_guest_user_id,
    'reservation',
    v_reservation_id::TEXT,
    'create',
    encode(digest(concat(v_code, v_total::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_code', v_code,
      'check_in', p_check_in,
      'check_out', p_check_out,
      'total_amount', v_total,
      'guest_count', p_guest_count,
      'unit_count', array_length(p_unit_ids, 1)
    )
  );

  RETURN QUERY SELECT
    v_reservation_id,
    v_code,
    'pending_payment'::TEXT,
    'Reservation created successfully. Please complete payment within 24 hours.'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
