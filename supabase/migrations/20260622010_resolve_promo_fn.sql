-- Resolve the promo to apply to a booking: an explicit code (validated, raises on
-- failure) OR, when no code is given, the best eligible auto-apply promo for the
-- kind (silent if none). Locks the chosen row so limited-use codes are race-safe.
-- Returns (promo_id, code, discount); promo_id NULL + discount 0 means "no promo".
-- Named dollar-quote tag; no dollar tokens in comments.

CREATE OR REPLACE FUNCTION public.resolve_promo_discount(
  p_code TEXT,
  p_total NUMERIC,
  p_user_id UUID,
  p_kind TEXT
) RETURNS TABLE (promo_id UUID, code TEXT, discount NUMERIC) AS $resolve_promo$
DECLARE
  v_norm TEXT;
  v_promo public.promo_codes%ROWTYPE;
  v_best public.promo_codes%ROWTYPE;
  v_best_discount NUMERIC := 0;
  r public.promo_codes%ROWTYPE;
  d NUMERIC;
BEGIN
  v_norm := NULLIF(UPPER(TRIM(COALESCE(p_code, ''))), '');

  IF v_norm IS NOT NULL THEN
    -- Explicit code path: validate and raise a guest-facing error on failure.
    SELECT * INTO v_promo FROM public.promo_codes WHERE UPPER(code) = v_norm FOR UPDATE;
    IF NOT FOUND OR NOT v_promo.is_active THEN
      RAISE EXCEPTION 'This promo code is not valid.';
    END IF;
    IF v_promo.applies_to NOT IN (p_kind, 'all') THEN
      RAISE EXCEPTION 'This promo code does not apply to %.', p_kind;
    END IF;
    IF v_promo.starts_at IS NOT NULL AND NOW() < v_promo.starts_at THEN
      RAISE EXCEPTION 'This promo code is not active yet.';
    END IF;
    IF v_promo.ends_at IS NOT NULL AND NOW() > v_promo.ends_at THEN
      RAISE EXCEPTION 'This promo code has expired.';
    END IF;
    IF p_total < v_promo.min_total THEN
      RAISE EXCEPTION 'A minimum spend of ₱% is required for this promo.', v_promo.min_total;
    END IF;
    IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
      RAISE EXCEPTION 'This promo code has been fully redeemed.';
    END IF;
    IF v_promo.per_user_limit IS NOT NULL AND p_user_id IS NOT NULL THEN
      IF (SELECT COUNT(*) FROM public.promo_redemptions
          WHERE promo_id = v_promo.promo_id AND user_id = p_user_id) >= v_promo.per_user_limit THEN
        RAISE EXCEPTION 'You have already used this promo code.';
      END IF;
    END IF;
    RETURN QUERY SELECT v_promo.promo_id, v_promo.code, public.promo_discount_amount(v_promo, p_total);
    RETURN;
  END IF;

  -- Auto-apply path: pick the eligible auto promo giving the largest discount.
  FOR r IN
    SELECT * FROM public.promo_codes
    WHERE is_active
      AND auto_apply
      AND applies_to IN (p_kind, 'all')
      AND (starts_at IS NULL OR NOW() >= starts_at)
      AND (ends_at IS NULL OR NOW() <= ends_at)
      AND min_total <= p_total
      AND (usage_limit IS NULL OR used_count < usage_limit)
    ORDER BY promo_id
    FOR UPDATE
  LOOP
    IF r.per_user_limit IS NOT NULL AND p_user_id IS NOT NULL THEN
      IF (SELECT COUNT(*) FROM public.promo_redemptions
          WHERE promo_id = r.promo_id AND user_id = p_user_id) >= r.per_user_limit THEN
        CONTINUE;
      END IF;
    END IF;
    d := public.promo_discount_amount(r, p_total);
    IF d > v_best_discount THEN
      v_best_discount := d;
      v_best := r;
    END IF;
  END LOOP;

  IF v_best.promo_id IS NOT NULL AND v_best_discount > 0 THEN
    RETURN QUERY SELECT v_best.promo_id, v_best.code, v_best_discount;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0::NUMERIC;
END;
$resolve_promo$ LANGUAGE plpgsql;
