-- ============================================
-- Phase 4: Cancel Reservation (guest/admin safe)
-- Created: 2026-02-07
-- Purpose: Allow guests to cancel their own reservations securely
-- ============================================

CREATE OR REPLACE FUNCTION public.cancel_reservation(
  p_reservation_id UUID
) RETURNS VOID AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT * INTO v_res
  FROM public.reservations
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_role != 'admin' AND v_res.guest_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to cancel this reservation';
  END IF;

  IF v_res.status IN ('checked_in', 'checked_out') THEN
    RAISE EXCEPTION 'Cannot cancel after check-in';
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled'
  WHERE reservation_id = p_reservation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.cancel_reservation TO authenticated;
