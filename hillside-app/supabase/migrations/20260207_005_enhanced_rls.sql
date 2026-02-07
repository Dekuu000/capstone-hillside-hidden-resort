-- ============================================
-- Phase 3 Security Enhancement: Enhanced RLS Policies
-- Created: 2026-02-07
-- Purpose: Enforce admin-only operations and prevent unauthorized access
-- ============================================

-- ====================
-- Helper Function: Check if User is Admin
-- ====================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_admin IS 
'Helper function to check if the current user has admin role.
Used in RLS policies for authorization checks.
STABLE: Result doesn''t change within a transaction.';

-- ====================
-- Drop Old Permissive Policies
-- ====================

-- These policies were too permissive (all authenticated users could modify)
-- Also drop any existing policies from Phase 2 to avoid conflicts
DROP POLICY IF EXISTS "authenticated_read_all_reservations" ON public.reservations;
DROP POLICY IF EXISTS "authenticated_insert_reservations" ON public.reservations;
DROP POLICY IF EXISTS "authenticated_update_reservations" ON public.reservations;
DROP POLICY IF EXISTS "guests_read_own_reservations" ON public.reservations;
DROP POLICY IF EXISTS "admins_read_all_reservations" ON public.reservations;
DROP POLICY IF EXISTS "admins_update_reservations" ON public.reservations;
DROP POLICY IF EXISTS "guests_cancel_own_reservations" ON public.reservations;
DROP POLICY IF EXISTS "no_direct_insert_reservations" ON public.reservations;
DROP POLICY IF EXISTS "no_delete_reservations" ON public.reservations;

DROP POLICY IF EXISTS "authenticated_insert_reservation_units" ON public.reservation_units;
DROP POLICY IF EXISTS "authenticated_update_reservation_units" ON public.reservation_units;
DROP POLICY IF EXISTS "authenticated_delete_reservation_units" ON public.reservation_units;
DROP POLICY IF EXISTS "read_reservation_units_based_on_reservation" ON public.reservation_units;
DROP POLICY IF EXISTS "no_direct_insert_reservation_units" ON public.reservation_units;
DROP POLICY IF EXISTS "no_direct_update_reservation_units" ON public.reservation_units;
DROP POLICY IF EXISTS "no_direct_delete_reservation_units" ON public.reservation_units;

-- ====================
-- Reservations Table: Enhanced RLS Policies
-- ====================

-- Policy: Admins can read all reservations
CREATE POLICY "admins_read_all_reservations" ON public.reservations
  FOR SELECT 
  USING (public.is_admin());

-- Policy: Guests can only read their own reservations
CREATE POLICY "guests_read_own_reservations" ON public.reservations
  FOR SELECT 
  USING (auth.uid() = guest_user_id);

-- Policy: No direct INSERT (must use create_reservation_atomic function)
-- This ensures all reservations go through validation and locking
CREATE POLICY "no_direct_insert_reservations" ON public.reservations
  FOR INSERT 
  WITH CHECK (false);

COMMENT ON POLICY "no_direct_insert_reservations" ON public.reservations IS
'Prevents direct INSERT to ensure all reservations use create_reservation_atomic() function.
This enforces atomic transactions and prevents race conditions.';

-- Policy: Admins can update any reservation
CREATE POLICY "admins_update_reservations" ON public.reservations
  FOR UPDATE 
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policy: Guests can only cancel their own pending/unverified reservations
CREATE POLICY "guests_cancel_own_reservations" ON public.reservations
  FOR UPDATE 
  USING (
    auth.uid() = guest_user_id 
    AND status IN ('pending_payment', 'for_verification')
  )
  WITH CHECK (
    auth.uid() = guest_user_id
    AND status = 'cancelled'
  );

COMMENT ON POLICY "guests_cancel_own_reservations" ON public.reservations IS
'Allows guests to cancel their own reservations only if status is pending_payment or for_verification.
Prevents cancellation of confirmed/checked-in reservations (admin only).';

-- Policy: No direct DELETE (admin must cancel instead for audit trail)
CREATE POLICY "no_delete_reservations" ON public.reservations
  FOR DELETE 
  USING (false);

-- ====================
-- Reservation Units Table: Enhanced RLS Policies
-- ====================

-- Policy: Read access based on reservation access
-- Users can only see reservation_units for reservations they can access
CREATE POLICY "read_reservation_units_based_on_reservation" ON public.reservation_units
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.reservation_id = reservation_units.reservation_id
      AND (public.is_admin() OR r.guest_user_id = auth.uid())
    )
  );

-- Policy: No direct manipulation of reservation_units
-- All changes must go through stored procedures or triggers
CREATE POLICY "no_direct_insert_reservation_units" ON public.reservation_units
  FOR INSERT 
  WITH CHECK (false);

CREATE POLICY "no_direct_update_reservation_units" ON public.reservation_units
  FOR UPDATE 
  USING (false)
  WITH CHECK (false);

CREATE POLICY "no_direct_delete_reservation_units" ON public.reservation_units
  FOR DELETE 
  USING (false);

COMMENT ON POLICY "no_direct_insert_reservation_units" ON public.reservation_units IS
'Prevents direct manipulation to ensure data integrity.
Reservation units are managed exclusively through create_reservation_atomic() function.';


-- ====================
-- Verification Queries
-- ====================

-- To verify policies are working, run these queries as different users:

-- As guest user (should see own reservations only):
-- SELECT * FROM reservations;

-- As admin user (should see all):
-- SELECT * FROM reservations;

-- As guest (should fail):
-- INSERT INTO reservations (...) VALUES (...);

-- As guest (should succeed with valid reservation):
-- SELECT * FROM create_reservation_atomic(...);
