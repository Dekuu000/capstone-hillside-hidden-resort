-- Helper: compute the peso discount a promo gives for a total. Named dollar-quote
-- tag, no dollar tokens in comments (Supabase SQL editor parser is naive).

CREATE OR REPLACE FUNCTION public.promo_discount_amount(p public.promo_codes, p_total NUMERIC)
RETURNS NUMERIC AS $promo_discount$
DECLARE
  v NUMERIC;
BEGIN
  IF p.discount_type = 'percent' THEN
    v := ROUND(p_total * (p.discount_value / 100.0), 2);
    IF p.max_discount IS NOT NULL THEN
      v := LEAST(v, p.max_discount);
    END IF;
  ELSE
    v := p.discount_value;
  END IF;
  RETURN LEAST(GREATEST(v, 0), p_total);
END;
$promo_discount$ LANGUAGE plpgsql;
