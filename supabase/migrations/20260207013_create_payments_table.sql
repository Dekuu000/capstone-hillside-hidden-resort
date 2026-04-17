-- ============================================
-- Phase 4: Payments Table
-- Created: 2026-02-07
-- Purpose: Track payment submissions and verification
-- ============================================

CREATE TABLE IF NOT EXISTS public.payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(reservation_id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit', 'full', 'on_site', 'refund')),
  method TEXT NOT NULL CHECK (method IN ('gcash', 'bank', 'cash', 'card')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reference_no TEXT,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by_admin_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Guests can read their own payments (via reservation ownership)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'guests_read_own_payments'
  ) THEN
    CREATE POLICY "guests_read_own_payments" ON public.payments
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.reservations r
          WHERE r.reservation_id = payments.reservation_id
            AND r.guest_user_id = auth.uid()
        )
      );
  END IF;

  -- Admins can read all payments
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'admins_read_all_payments'
  ) THEN
    CREATE POLICY "admins_read_all_payments" ON public.payments
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE user_id = auth.uid() AND role = 'admin'
        )
      );
  END IF;

  -- Insert: guests for their own reservations or admins for any
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'authenticated_insert_payments'
  ) THEN
    CREATE POLICY "authenticated_insert_payments" ON public.payments
      FOR INSERT
      WITH CHECK (
        auth.role() = 'authenticated'
        AND (
          EXISTS (
            SELECT 1 FROM public.reservations r
            WHERE r.reservation_id = payments.reservation_id
              AND r.guest_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.users
            WHERE user_id = auth.uid() AND role = 'admin'
          )
        )
      );
  END IF;

  -- Update: admins only (verification)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'admins_update_payments'
  ) THEN
    CREATE POLICY "admins_update_payments" ON public.payments
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE user_id = auth.uid() AND role = 'admin'
        )
      );
  END IF;

  -- Delete: admins only (rare)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND policyname = 'admins_delete_payments'
  ) THEN
    CREATE POLICY "admins_delete_payments" ON public.payments
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.users
          WHERE user_id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_reservation ON public.payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
