-- ============================================
-- Units media upgrade
-- Created: 2026-03-05
-- Purpose:
-- 1) Add thumbnail URLs for gallery performance
-- 2) Provision unit-images storage bucket
-- 3) Restrict write/delete to admins for unit media paths
-- 4) Extend available units RPC with gallery fields
-- ============================================

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS image_thumb_urls TEXT[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.units
SET image_thumb_urls = '{}'::text[]
WHERE image_thumb_urls IS NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('unit-images', 'unit-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'unit_images_admin_insert'
  ) THEN
    CREATE POLICY "unit_images_admin_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'unit-images'
        AND split_part(name, '/', 1) = 'units'
        AND public.is_admin()
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'unit_images_admin_update'
  ) THEN
    CREATE POLICY "unit_images_admin_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'unit-images'
        AND split_part(name, '/', 1) = 'units'
        AND public.is_admin()
      )
      WITH CHECK (
        bucket_id = 'unit-images'
        AND split_part(name, '/', 1) = 'units'
        AND public.is_admin()
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'unit_images_admin_delete'
  ) THEN
    CREATE POLICY "unit_images_admin_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'unit-images'
        AND split_part(name, '/', 1) = 'units'
        AND public.is_admin()
      );
  END IF;
END$$;

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
  image_urls TEXT[],
  image_thumb_urls TEXT[],
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
    u.image_urls,
    u.image_thumb_urls,
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
