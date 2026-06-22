-- Promo codes (Phase 1: stays) — tables + reservation columns.
-- The reservation RPC that validates/applies the discount lives in the next
-- migration (20260622005); the function is kept in its own file so the Supabase
-- CLI statement splitter handles the large dollar-quoted body cleanly.

-- ── Tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_codes (
  promo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  max_discount NUMERIC(10, 2),                 -- optional cap for percent codes
  min_total NUMERIC(10, 2) NOT NULL DEFAULT 0, -- minimum booking total to qualify
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  usage_limit INTEGER,                         -- total redemptions allowed (null = unlimited)
  used_count INTEGER NOT NULL DEFAULT 0,
  per_user_limit INTEGER,                      -- redemptions per guest (null = unlimited)
  applies_to TEXT NOT NULL DEFAULT 'stays' CHECK (applies_to IN ('stays', 'tours', 'all')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Codes are matched case-insensitively, so enforce uniqueness on UPPER(code).
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code_upper ON public.promo_codes (UPPER(code));

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id UUID NOT NULL REFERENCES public.promo_codes(promo_id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(reservation_id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  amount_discounted NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON public.promo_redemptions (promo_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON public.promo_redemptions (user_id);

-- RLS: no public access. All reads/writes go through the API (service role,
-- which bypasses RLS); the reservation RPC is SECURITY DEFINER so it can read
-- and update these tables during booking.
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

-- ── Reservation discount columns ─────────────────────────────────────
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS original_total NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_code TEXT;
