-- ============================================
-- Fix: Add DISTINCT to get_available_units to prevent duplicates
-- Created: 2026-02-07
-- Purpose: Ensure no duplicate units are returned
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
  SELECT DISTINCT ON (u.unit_id)
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
  ORDER BY u.unit_id, u.type, u.base_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_available_units IS 
'Returns available units for a given date range (Phase 2).
Updated in Phase 3 to ensure no duplicates with DISTINCT ON.';
