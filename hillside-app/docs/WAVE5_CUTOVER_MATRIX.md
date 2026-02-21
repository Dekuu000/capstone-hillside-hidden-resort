# Wave 5 Cutover Matrix

Last updated: 2026-02-21

## Purpose

Track remaining migration work to fully converge legacy `hillside-app` routes/services into `hillside-next` + `hillside-api`.

## Route Parity Matrix

| Legacy Route (React) | Next.js Route | Status | Notes |
|---|---|---|---|
| `/login` | `/login` | Native | Live in Next |
| `/register` | `/register` | Native | Live in Next |
| `/book` | `/book` | Native | V2 API wired |
| `/tours` | `/tours` | Native | V2 API wired |
| `/my-bookings` | `/my-bookings` | Native | V2 API wired |
| `/admin` | `/admin` | Native | Dashboard live |
| `/admin/units` | `/admin/units` | Native | V2 API wired |
| `/admin/units/new` | `/admin/units/new` | Redirect | Redirects to `/admin/units` |
| `/admin/units/:unitId/edit` | `/admin/units/[unitId]/edit` | Redirect | Redirects to `/admin/units?unit_id=...` |
| `/admin/reservations` | `/admin/reservations` | Native | V2 API wired |
| `/admin/reservations/:reservationId` | `/admin/reservations/[reservationId]` | Redirect + Auto-open | Redirects to query form and auto-opens details modal |
| `/admin/reservations/new` | `/admin/reservations/new` | Redirect | Redirects to `/admin/reservations` |
| `/admin/payments` | `/admin/payments` | Native | V2 API wired |
| `/admin/audit` | `/admin/audit` | Native | V2 API wired |
| `/admin/reports` | `/admin/reports` | Native | V2 API wired |
| `/admin/scan` | `/admin/scan` | Redirect | Redirects to `/admin/check-in` |
| `/admin/tours/new` | `/admin/tours/new` | Redirect | Redirects to `/admin/walk-in-tour` |
| `/` (role-based home) | `/` | Native | Server-side role redirect: admin -> `/admin/reservations`, guest -> `/my-bookings`, unauthenticated -> auth entry |

## Legacy Service Cutover Matrix

| Service File | Cutover Status | Remaining Direct Supabase Paths | Recommended Next Action |
|---|---|---|---|
| `reservationsService.ts` | Migrated V2-first | Fallback path only (facade-off mode) | Keep fallback during burn-in, then remove in deprecation phase |
| `paymentsService.ts` | Migrated V2-first | Fallback path only (facade-off mode) | Keep fallback during burn-in, then remove in deprecation phase |
| `unitsService.ts` | Migrated V2-first | Fallback path only (facade-off mode) | Keep fallback during burn-in, then remove in deprecation phase |
| `reportsService.ts` | Migrated V2-first | Fallback path only (facade-off mode) | Keep fallback during burn-in, then remove in deprecation phase |
| `auditService.ts` | Migrated V2-first | Fallback remains for facade-off mode | Keep until legacy deprecation window closes |
| `servicesService.ts` | Migrated V2-first | Fallback remains for facade-off mode | Keep until legacy deprecation window closes |
| `bookingsService.ts` | Migrated V2-first | Fallback remains for facade-off mode | Keep until legacy deprecation window closes |
| `storageService.ts` | Intentional direct Supabase | Storage upload/signed URL | Keep direct (storage plane), not a migration blocker |
| `anchorService.ts` | Legacy-only | Edge Function + direct audit tables | Keep as legacy module until audit/anchor explorer replacement is finalized |

## Wave 5 Exit-Oriented Checklist

1. Complete Next.js root role-based landing parity (`/`). (Completed)
2. Add missing V2 endpoints for status update, single-unit fetch, and on-site payment. (Completed)
3. Switch remaining legacy services to V2-first for those endpoints. (Completed)
4. Validate key flows in facade-on mode:
   - Admin units/reservations/payments/reports/audit/check-in
   - Guest booking/tours/my-bookings
   - Status: Completed (2026-02-21)
5. Confirm only intentional direct Supabase paths remain (`storageService`, legacy `anchorService`). (Completed)
6. Freeze redirect compatibility paths and publish final deprecation timetable for React app. (Completed: see `hillside-app/docs/LEGACY_DEPRECATION_TIMETABLE.md`)

## Burn-In Evidence Snapshot (Facade-On)

1. Guest flows validated end-to-end:
   - booking create (room/tour), payment submission, My Bookings status progression, check-in QR issue/refresh.
2. Admin flows validated end-to-end:
   - units edit/status toggle, reservations status patch, payments verify/reject/on-site, check-in override/check-out.
3. Escrow reconciliation baseline remained clean after burn-in operations:
   - `mismatch = 0`
   - `missing_onchain = 0`
   - `alert = false`
