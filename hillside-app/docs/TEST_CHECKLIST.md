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

## Admin Flows
- Admin verify payment:
  - Payments list shows pending
  - Open proof and verify
  - Reservation moves to confirmed when rules satisfied
- Record on-site payment:
  - Reservation Details -> record on-site payment works

## Smoke
- Login/logout works for admin and guest
- No broken routes: /book, /tours, /my-bookings, /admin/payments
