-- Auto-applied (no-code) seasonal promos. An auto promo has auto_apply = true and
-- usually no code; it is applied automatically to any eligible booking when the
-- guest does not enter a code. Simple statements only.

ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS auto_apply BOOLEAN NOT NULL DEFAULT FALSE;

-- Auto promos need no code, so code becomes nullable (the unique index is on
-- UPPER(code) and treats NULLs as distinct, so multiple code-less promos are ok).
ALTER TABLE public.promo_codes ALTER COLUMN code DROP NOT NULL;
