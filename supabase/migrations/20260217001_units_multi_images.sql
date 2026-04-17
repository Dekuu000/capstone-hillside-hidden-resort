-- ============================================
-- Units: support multiple images per unit
-- Created: 2026-02-17
-- ============================================

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- Backfill existing single image values into image_urls.
UPDATE public.units
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- Existing function has a different return shape, so drop first.
DROP FUNCTION IF EXISTS public.get_available_units(DATE, DATE, TEXT);

CREATE FUNCTION public.get_available_units(
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
  image_urls TEXT[],
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
    COALESCE(u.image_urls, ARRAY[]::TEXT[]) AS image_urls,
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

REVOKE ALL ON FUNCTION public.get_available_units(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_units(DATE, DATE, TEXT) TO authenticated;
