-- Cleanup script: remove only admin-owned online reservations (guest rows untouched)
-- Safe usage:
-- 1) Run PREVIEW.
-- 2) Run BACKUP.
-- 3) Run DELETE transaction.
-- 4) Run VERIFY.
--
-- Scope defaults to sample admin email. Adjust as needed.

-- =========================
-- 1) PREVIEW
-- =========================
SELECT
  r.reservation_id,
  r.reservation_code,
  u.email AS guest_email,
  u.role AS guest_role,
  r.reservation_source,
  r.status,
  r.check_in_date,
  r.check_out_date,
  r.total_amount,
  r.amount_paid_verified,
  r.created_at
FROM public.reservations r
JOIN public.users u ON u.user_id = r.guest_user_id
WHERE u.role = 'admin'
  AND r.reservation_source = 'online'
  AND u.email IN ('sample@example.com')
ORDER BY r.created_at DESC;

-- =========================
-- 2) BACKUP SNAPSHOT (append-only)
-- =========================
CREATE TABLE IF NOT EXISTS public.backup_admin_online_reservations AS
SELECT
  r.*,
  u.email AS backup_guest_email,
  u.role AS backup_guest_role,
  now() AS backup_taken_at,
  'admin_online_cleanup'::text AS backup_reason
FROM public.reservations r
JOIN public.users u ON u.user_id = r.guest_user_id
WHERE 1 = 0;

INSERT INTO public.backup_admin_online_reservations
SELECT
  r.*,
  u.email AS backup_guest_email,
  u.role AS backup_guest_role,
  now() AS backup_taken_at,
  'admin_online_cleanup'::text AS backup_reason
FROM public.reservations r
JOIN public.users u ON u.user_id = r.guest_user_id
WHERE u.role = 'admin'
  AND r.reservation_source = 'online'
  AND u.email IN ('sample@example.com');

-- =========================
-- 3) CLEAN DELETE (transaction)
-- Deletes only rows owned by admin account(s) with source=online.
-- Guest rows are NOT affected.
-- =========================
BEGIN;

DELETE FROM public.reservations r
USING public.users u
WHERE u.user_id = r.guest_user_id
  AND u.role = 'admin'
  AND u.email IN ('sample@example.com')
  AND r.reservation_source = 'online';

COMMIT;

-- =========================
-- 4) VERIFY AFTER CLEANUP
-- =========================
SELECT
  r.reservation_id,
  r.reservation_code,
  u.email AS guest_email,
  r.reservation_source,
  r.status,
  r.updated_at
FROM public.reservations r
JOIN public.users u ON u.user_id = r.guest_user_id
WHERE u.role = 'admin'
  AND u.email IN ('sample@example.com')
ORDER BY r.updated_at DESC, r.created_at DESC;
