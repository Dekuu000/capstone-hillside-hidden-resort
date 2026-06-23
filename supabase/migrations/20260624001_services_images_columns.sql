-- ============================================
-- Tours (services): support uploaded photos
-- Created: 2026-06-24
-- Purpose: store a gallery of uploaded photos per tour (day_tour / night_tour),
--          mirroring the units image model. Storage policies live in the next
--          migration (kept separate so the DO-block file has no other statements).
-- ============================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS image_thumb_urls TEXT[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.services
SET image_urls = '{}'::text[]
WHERE image_urls IS NULL;

UPDATE public.services
SET image_thumb_urls = '{}'::text[]
WHERE image_thumb_urls IS NULL;
