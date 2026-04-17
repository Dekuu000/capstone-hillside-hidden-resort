-- ============================================
-- Wave 3: Dynamic QR anti-replay token store
-- Created: 2026-02-21
-- ============================================

CREATE TABLE IF NOT EXISTS public.qr_tokens (
  jti TEXT PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
  reservation_code TEXT NOT NULL,
  rotation_version INTEGER NOT NULL CHECK (rotation_version >= 1),
  signature TEXT NOT NULL,
  token_payload TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  consumed_by_scanner_id TEXT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_reservation
  ON public.qr_tokens (reservation_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_expiry
  ON public.qr_tokens (expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_open
  ON public.qr_tokens (revoked, consumed_at, expires_at DESC);

CREATE OR REPLACE FUNCTION public.consume_qr_token(
  p_jti TEXT,
  p_scanner_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.qr_tokens
  SET
    consumed_at = timezone('utc', now()),
    consumed_by_scanner_id = p_scanner_id
  WHERE jti = p_jti
    AND revoked = FALSE
    AND consumed_at IS NULL
    AND expires_at >= timezone('utc', now());

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_qr_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_qr_token(TEXT, TEXT) TO authenticated;
