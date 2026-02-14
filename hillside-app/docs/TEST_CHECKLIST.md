# Quick Test Checklist

Use this after each refactor slice to validate core flows.

## Build / Type Safety
- npm run build (no errors)
- No TypeScript errors in console

## Guest Flows
- Tour booking:
  - Select tour + date + adults/kids
  - Pay-now presets and custom input update totals correctly
  - Reserve tour works
- Tour payment proof:
  - My Bookings shows correct pay-now amount
  - Update amount (if pending payment, no proof yet)
  - Upload proof and submit
- Unit reservation:
  - Select units and dates, payment summary updates
  - Reserve booking works
- Calendar UI (guest):
  - Availability calendar opens in modal and fits mobile width
  - Booked/maintenance/unavailable dates are not selectable
  - Selected range shows blue highlight
  - Legend colors match statuses
- QR visibility (guest):
  - QR appears only when status=confirmed OR balance_due=0
  - Otherwise shows "QR available after payment is verified."

## Admin Flows
- Admin verify payment:
  - Payments list shows pending
  - Open proof and verify
  - Reservation moves to confirmed when rules satisfied
- Record on-site payment:
  - Reservation Details -> record on-site payment works
- QR scan + check-in/out:
  - /admin/scan validates reservation code
  - Blocked when unpaid (shows reason + allows override with reason)
  - Check-in updates status to checked_in
  - Check-out updates status to checked_out
  - Audit log includes checkin/checkout or override_checkin
- Offline scan queue:
  - Offline duplicate scan updates timestamp (no duplicate item)
  - Adding 101+ items removes oldest with warning
  - Expired item (older than 48h) shows expired and is not synced
  - Manual Sync now (online) shows summary toast
- Audit Logs:
  - /admin/audit loads
  - Filters (action/entity/date) update list
- Anchoring (Phase 7):
  - /admin/audit shows latest anchor card
  - Anchor now returns "No new audit logs to anchor" when empty
  - Anchor now submits tx and displays tx_hash
  - Confirm status updates to confirmed (if mined)
  - Verify (DB) shows Match for latest anchor
  - Unanchored rows are expected for non-critical actions
  - Demo mode: Verify JWT may be disabled for anchor-audit
- Reports:
  - /admin/reports loads
  - SQL Editor admin-claims test: get_report_summary/daily/monthly return rows
  - Export Summary CSV works
  - Export Transactions CSV works (no guest PII)
  - Insights section renders
  - Analytics charts render with date range filters
  - Summary cards match CSV totals
- Calendar UI (admin):
  - Audit Logs date filters open availability calendar modal
  - Reports date filters open availability calendar modal
  - Walk-in tour date uses same calendar UI

## Smoke
- Login/logout works for admin and guest
- No broken routes: /book, /tours, /my-bookings, /admin/payments, /admin/audit, /admin/reports

## Final Regression (Before Demo)
- npm run build (no errors)
- Admin scan: validate + check-in + checkout + override with reason
- Offline queue: add, sync now, expired handling, dedup
- Guest QR: locked before confirm; downloadable after confirm
- Payments: submit proof, admin verify, balance due updates
