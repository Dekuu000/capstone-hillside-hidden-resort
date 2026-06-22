-- ============================================
-- Verified guest reviews (one per completed stay)
-- Created: 2026-06-22
-- A review is tied to a reservation (unique) + the unit it covers. Eligibility
-- (the reservation is the guest's and checked_out) is enforced in the API with
-- the service role; rows are public so listings can show them.
-- ============================================

CREATE TABLE IF NOT EXISTS public.reviews (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(unit_id) ON DELETE CASCADE,
  guest_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL,
  comment TEXT NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reviews_rating_check' AND conrelid = 'public.reviews'::regclass
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5);
  END IF;
END$$;

-- One review per completed booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_reservation ON public.reviews (reservation_id);

CREATE INDEX IF NOT EXISTS idx_reviews_unit_created
  ON public.reviews (unit_id, created_at DESC)
  WHERE is_hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_reviews_guest_created
  ON public.reviews (guest_user_id, created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
DROP POLICY IF EXISTS "reviews_select_own" ON public.reviews;
DROP POLICY IF EXISTS "reviews_update_own" ON public.reviews;

-- Anyone may read visible reviews (they appear publicly on listings).
CREATE POLICY "reviews_select_public" ON public.reviews
  FOR SELECT
  USING (is_hidden = FALSE);

-- A guest can always read their own review (even if hidden by an admin).
CREATE POLICY "reviews_select_own" ON public.reviews
  FOR SELECT
  USING (auth.uid() = guest_user_id);

-- A guest may edit their own review text/rating.
CREATE POLICY "reviews_update_own" ON public.reviews
  FOR UPDATE
  USING (auth.uid() = guest_user_id)
  WITH CHECK (auth.uid() = guest_user_id);

-- No INSERT policy: reviews are created only by the service role after the API
-- verifies the reservation is the guest's own and checked out.
