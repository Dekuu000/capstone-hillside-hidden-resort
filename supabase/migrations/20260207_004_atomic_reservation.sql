-- ============================================
-- Phase 3 Security Enhancement: Atomic Reservation Creation
-- Created: 2026-02-07
-- Purpose: Prevent race conditions and double bookings
-- ============================================

-- ====================
-- Atomic Reservation Creation Function
-- ====================
-- This function ensures reservation creation is atomic with row-level locks
-- preventing double bookings even under high concurrency

CREATE OR REPLACE FUNCTION public.create_reservation_atomic(
  p_guest_user_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_unit_ids UUID[],
  p_rates NUMERIC[],
  p_total_amount NUMERIC,
  p_deposit_required NUMERIC DEFAULT NULL,
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
BEGIN
  -- ====================
  -- Input Validation
  -- ====================
  
  -- Validate date order
  IF p_check_in >= p_check_out THEN
    RAISE EXCEPTION 'Invalid dates: check-out must be after check-in'
      USING HINT = 'Please select a check-out date that is later than the check-in date';
  END IF;

  -- Validate dates are in future
  IF p_check_in < CURRENT_DATE THEN
    RAISE EXCEPTION 'Invalid dates: check-in must be in the future'
      USING HINT = 'Cannot create reservations for past dates';
  END IF;

  -- Validate maximum stay (30 nights)
  v_nights := (p_check_out - p_check_in)::INTEGER;
  IF v_nights > 30 THEN
    RAISE EXCEPTION 'Maximum stay is 30 nights. Current selection: % nights', v_nights;
  END IF;

  -- Validate units selected
  IF array_length(p_unit_ids, 1) IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No units selected'
      USING HINT = 'Please select at least one unit';
  END IF;

  -- Validate maximum units (10 per reservation)
  IF array_length(p_unit_ids, 1) > 10 THEN
    RAISE EXCEPTION 'Maximum 10 units per reservation. Current selection: % units', array_length(p_unit_ids, 1);
  END IF;

  -- Validate matching arrays
  IF array_length(p_unit_ids, 1) != array_length(p_rates, 1) THEN
    RAISE EXCEPTION 'Mismatched units and rates arrays'
      USING HINT = 'System error. Please try again.';
  END IF;

  -- Validate amount is positive
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount'
      USING HINT = 'Total amount must be greater than zero';
  END IF;

  -- ====================
  -- Atomic Unit Locking
  -- ====================
  
  -- Lock all requested units for update (prevents race conditions)
  -- NOWAIT ensures we fail fast if another transaction holds the lock
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

  -- Verify all units exist and are active
  IF (SELECT COUNT(*) FROM public.units WHERE unit_id = ANY(p_unit_ids) AND is_active = true) 
     != array_length(p_unit_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected units are not available'
      USING HINT = 'Some units may have been deactivated. Please refresh and try again.';
  END IF;

  -- ====================
  -- Availability Check
  -- ====================
  
  -- Check availability for ALL units atomically
  FOR i IN 1..array_length(p_unit_ids, 1) LOOP
    v_unit_id := p_unit_ids[i];
    
    SELECT public.check_unit_availability(
      v_unit_id,
      p_check_in,
      p_check_out,
      NULL
    ) INTO v_available;
    
    IF NOT v_available THEN
      RAISE EXCEPTION 'Unit not available for selected dates'
        USING HINT = 'One or more units are already booked for these dates. Please select different dates or units.';
    END IF;
  END LOOP;

  -- ====================
  -- Create Reservation
  -- ====================
  
  -- Generate unique reservation code
  v_code := public.generate_reservation_code();
  
  -- Calculate deposit (default 50% of total)
  v_deposit := COALESCE(p_deposit_required, p_total_amount * 0.5);

  -- Insert reservation record
  INSERT INTO public.reservations (
    reservation_code,
    guest_user_id,
    check_in_date,
    check_out_date,
    total_amount,
    deposit_required,
    amount_paid_verified,
    status,
    notes,
    hold_expires_at
  ) VALUES (
    v_code,
    p_guest_user_id,
    p_check_in,
    p_check_out,
    p_total_amount,
    v_deposit,
    0,
    'pending_payment',
    p_notes,
    NOW() + INTERVAL '24 hours'
  ) RETURNING reservations.reservation_id INTO v_reservation_id;

  -- ====================
  -- Insert Reservation Units
  -- ====================
  
  FOR i IN 1..array_length(p_unit_ids, 1) LOOP
    INSERT INTO public.reservation_units (
      reservation_id,
      unit_id,
      rate_snapshot,
      quantity_or_nights
    ) VALUES (
      v_reservation_id,
      p_unit_ids[i],
      p_rates[i],
      v_nights
    );
  END LOOP;

  -- ====================
  -- Create Audit Log
  -- ====================
  
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
    encode(digest(concat(v_code, p_total_amount::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_code', v_code,
      'check_in', p_check_in,
      'check_out', p_check_out,
      'total_amount', p_total_amount,
      'unit_count', array_length(p_unit_ids, 1)
    )
  );

  -- ====================
  -- Return Success
  -- ====================
  
  RETURN QUERY SELECT 
    v_reservation_id,
    v_code,
    'pending_payment'::TEXT,
    'Reservation created successfully. Please complete payment within 24 hours.'::TEXT;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================
-- Security: Grant Permissions
-- ====================

-- Only authenticated users can create reservations
GRANT EXECUTE ON FUNCTION public.create_reservation_atomic TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_reservation_atomic FROM anon;

-- ====================
-- Documentation
-- ====================

COMMENT ON FUNCTION public.create_reservation_atomic IS 
'Atomically creates a reservation with row-level locks to prevent race conditions.
Returns: reservation_id, reservation_code, status, message.
Throws exceptions with user-friendly messages on validation or availability failures.
Security: SECURITY DEFINER ensures consistent permissions regardless of caller.';
