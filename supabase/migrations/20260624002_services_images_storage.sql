-- ============================================
-- Tours (services): storage policies for tour photos
-- Created: 2026-06-24
-- Purpose: reuse the public unit-images bucket for tour photos under the
--          tours/ path prefix, restricting writes/deletes to admins. Read is
--          public (bucket is public), matching units.
-- ============================================

-- Bucket already provisioned by the units media migration; ensure it exists.
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
      AND policyname = 'tour_images_admin_insert'
  ) THEN
    CREATE POLICY "tour_images_admin_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'unit-images'
        AND split_part(name, '/', 1) = 'tours'
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
      AND policyname = 'tour_images_admin_update'
  ) THEN
    CREATE POLICY "tour_images_admin_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'unit-images'
        AND split_part(name, '/', 1) = 'tours'
        AND public.is_admin()
      )
      WITH CHECK (
        bucket_id = 'unit-images'
        AND split_part(name, '/', 1) = 'tours'
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
      AND policyname = 'tour_images_admin_delete'
  ) THEN
    CREATE POLICY "tour_images_admin_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'unit-images'
        AND split_part(name, '/', 1) = 'tours'
        AND public.is_admin()
      );
  END IF;
END$$;
