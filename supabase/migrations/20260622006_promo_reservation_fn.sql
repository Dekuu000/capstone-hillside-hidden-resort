-- create_reservation_atomic with server-side promo discount (Phase 1: stays).
-- A single statement using a NAMED dollar-quote tag for the body, and no
-- dollar-quote tokens in these comments, so the Supabase SQL editor's naive
-- parser can never mis-pair a delimiter. DROP is in 20260622005, GRANT in
-- 20260622007.
--
-- Discount is applied BEFORE the deposit so the deposit keys off the discounted
-- total. The promo row is locked to keep limited-use codes race-safe. Only the
-- guest stay path passes a code; other callers omit it (defaults NULL).

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
  p_notes TEXT DEFAULT NULL,
  p_promo_code TEXT DEFAULT NULL
) RETURNS TABLE (
  reservation_id UUID,
  reservation_code TEXT,
  status TEXT,
  message TEXT,
  deposit_required NUMERIC,
  expected_pay_now NUMERIC,
  deposit_policy_version TEXT,
  deposit_rule_applied TEXT,
  cancellation_actor TEXT,
  policy_outcome TEXT
) AS $reservation_fn$
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
  v_role TEXT;
  v_expected_pay_now NUMERIC;
  v_deposit_rule TEXT := 'stay_20pct_clamp_500_5000';
  v_deposit_policy_version TEXT := 'v2_2026_06';
  v_promo public.promo_codes%ROWTYPE;
  v_promo_code_norm TEXT;
  v_original_total NUMERIC := 0;
  v_discount NUMERIC := 0;
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

  -- Compute server-side rates with pax-based rules for special units.
  SELECT array_agg(
           CASE UPPER(TRIM(COALESCE(u.unit_code, '')))
             WHEN 'AMN-EVERGREEN-PAVILION' THEN
               GREATEST(COALESCE(u.base_price, 0), 8500)
               + (GREATEST(0, p_guest_count - 30) * 250)
             WHEN 'AMN-PINECREST-EXCLUSIVE' THEN
               GREATEST(COALESCE(u.base_price, 0), 12000)
               + (GREATEST(0, p_guest_count - 20) * 400)
             ELSE
               COALESCE(u.base_price, 0)
           END
           ORDER BY x.ord
         )
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

  v_original_total := v_total;

  -- Promo code: validate + apply before the deposit. Lock the promo row so
  -- limited-use codes can't be over-redeemed under concurrency.
  v_promo_code_norm := NULLIF(UPPER(TRIM(COALESCE(p_promo_code, ''))), '');
  IF v_promo_code_norm IS NOT NULL THEN
    SELECT * INTO v_promo
    FROM public.promo_codes
    WHERE UPPER(code) = v_promo_code_norm
    FOR UPDATE;

    IF NOT FOUND OR NOT v_promo.is_active THEN
      RAISE EXCEPTION 'This promo code is not valid.';
    END IF;
    IF v_promo.applies_to NOT IN ('stays', 'all') THEN
      RAISE EXCEPTION 'This promo code does not apply to stays.';
    END IF;
    IF v_promo.starts_at IS NOT NULL AND NOW() < v_promo.starts_at THEN
      RAISE EXCEPTION 'This promo code is not active yet.';
    END IF;
    IF v_promo.ends_at IS NOT NULL AND NOW() > v_promo.ends_at THEN
      RAISE EXCEPTION 'This promo code has expired.';
    END IF;
    IF v_total < v_promo.min_total THEN
      RAISE EXCEPTION 'A minimum spend of ₱% is required for this promo.', v_promo.min_total;
    END IF;
    IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
      RAISE EXCEPTION 'This promo code has been fully redeemed.';
    END IF;
    IF v_promo.per_user_limit IS NOT NULL THEN
      IF (SELECT COUNT(*) FROM public.promo_redemptions
          WHERE promo_id = v_promo.promo_id AND user_id = p_guest_user_id) >= v_promo.per_user_limit THEN
        RAISE EXCEPTION 'You have already used this promo code.';
      END IF;
    END IF;

    IF v_promo.discount_type = 'percent' THEN
      v_discount := ROUND(v_total * (v_promo.discount_value / 100.0), 2);
      IF v_promo.max_discount IS NOT NULL THEN
        v_discount := LEAST(v_discount, v_promo.max_discount);
      END IF;
    ELSE
      v_discount := v_promo.discount_value;
    END IF;

    v_discount := LEAST(v_discount, v_total); -- never discount below zero
    v_total := v_total - v_discount;
  END IF;

  -- Deposit: 20% of (discounted) total, floored ₱500, capped ₱5,000, <= total.
  v_deposit := LEAST(v_total, GREATEST(500, LEAST(5000, ROUND(v_total * 0.20, 2))));

  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF p_deposit_required IS NOT NULL AND v_role = 'admin' THEN
    v_deposit := LEAST(v_total, p_deposit_required);
    v_deposit_rule := 'admin_override';
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
    original_total,
    discount_amount,
    promo_code,
    deposit_required,
    expected_pay_now,
    amount_paid_verified,
    status,
    guest_count,
    notes,
    hold_expires_at,
    deposit_policy_version,
    deposit_rule_applied
  ) VALUES (
    v_code,
    p_guest_user_id,
    p_check_in,
    p_check_out,
    v_total,
    v_original_total,
    v_discount,
    CASE WHEN v_discount > 0 THEN v_promo.code ELSE NULL END,
    v_deposit,
    v_expected_pay_now,
    0,
    'pending_payment',
    p_guest_count,
    p_notes,
    NOW() + INTERVAL '24 hours',
    v_deposit_policy_version,
    v_deposit_rule
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

  -- Record the redemption + bump the usage counter (same txn + row lock).
  IF v_discount > 0 AND v_promo.promo_id IS NOT NULL THEN
    UPDATE public.promo_codes
    SET used_count = used_count + 1, updated_at = NOW()
    WHERE promo_id = v_promo.promo_id;

    INSERT INTO public.promo_redemptions (promo_id, reservation_id, user_id, amount_discounted)
    VALUES (v_promo.promo_id, v_reservation_id, p_guest_user_id, v_discount);
  END IF;

  PERFORM public.create_audit_log(
    'reservation',
    v_reservation_id::TEXT,
    'create',
    encode(digest(concat(v_code, v_total::TEXT, NOW()::TEXT), 'sha256'), 'hex'),
    jsonb_build_object(
      'reservation_code', v_code,
      'check_in', p_check_in,
      'check_out', p_check_out,
      'total_amount', v_total,
      'original_total', v_original_total,
      'discount_amount', v_discount,
      'promo_code', CASE WHEN v_discount > 0 THEN v_promo.code ELSE NULL END,
      'guest_count', p_guest_count,
      'unit_count', array_length(p_unit_ids, 1),
      'deposit_required', v_deposit,
      'expected_pay_now', v_expected_pay_now,
      'deposit_policy_version', v_deposit_policy_version,
      'deposit_rule_applied', v_deposit_rule
    )
  );

  RETURN QUERY SELECT
    v_reservation_id,
    v_code,
    'pending_payment'::TEXT,
    'Reservation created successfully. Please complete payment within 24 hours.'::TEXT,
    v_deposit,
    v_expected_pay_now,
    v_deposit_policy_version,
    v_deposit_rule,
    NULL::TEXT,
    NULL::TEXT;
END;
$reservation_fn$ LANGUAGE plpgsql SECURITY DEFINER;
