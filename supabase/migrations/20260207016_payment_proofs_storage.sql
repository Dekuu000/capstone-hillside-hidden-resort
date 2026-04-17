-- ============================================
-- Phase 4: Payment Proofs Storage (Supabase Storage)
-- Created: 2026-02-07
-- Purpose: Secure file upload for payment proofs
-- ============================================

-- Create bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can upload to their own folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'payment_proofs_insert_own'
  ) THEN
    CREATE POLICY "payment_proofs_insert_own" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'payment-proofs'
        AND split_part(name, '/', 1) = 'payments'
        AND split_part(name, '/', 2) = auth.uid()::text
      );
  END IF;
END$$;

-- Policy: users can read their own proofs; admins can read all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'payment_proofs_select'
  ) THEN
    CREATE POLICY "payment_proofs_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'payment-proofs'
        AND (
          (
            split_part(name, '/', 1) = 'payments'
            AND split_part(name, '/', 2) = auth.uid()::text
          )
          OR EXISTS (
            SELECT 1 FROM public.users
            WHERE user_id = auth.uid() AND role = 'admin'
          )
        )
      );
  END IF;
END$$;
