# hillside-next

Next.js 15 / React 19 PWA — **the active Hillside Hidden Resort web app** (guest portal + role-based back office).

## Purpose

- Host the guest booking funnel, My Trips, reviews, notifications, and offline-friendly flows.
- Host the role-based back office (Front Desk / Manager / System Admin).
- Integrate with FastAPI v2 endpoints and Supabase auth/session.
- Use Tailwind CSS (v4) for page styling.
- Use shared Zod schemas/types from `packages/shared` and the Supabase schema in `../supabase`.

## Local Run

```bash
cd hillside-next
npm install
cp .env.example .env.local
npm run dev
```

Health route:

- `GET /api/health`

Chain envs (client-side display/routing only):

- `NEXT_PUBLIC_CHAIN_KEY=sepolia|amoy`
- `NEXT_PUBLIC_SUPPORTED_CHAIN_KEYS=sepolia,amoy`
- `NEXT_PUBLIC_CHAIN_ID` (optional; auto-derived from `NEXT_PUBLIC_CHAIN_KEY` when omitted)

Main page (`/`) includes:

- Supabase session status card.
- FastAPI health status card (`NEXT_PUBLIC_API_BASE_URL/health`).

## Routes / Surfaces

A persistent guest header (search nav + notification bell) and mobile bottom nav are mounted once in the root layout so they survive navigation.

- Guest funnel:
  - `/stays`, `/stays/[unitId]` -> `GET /v2/catalog/units/available`; listing detail shows the **live review rating** (`GET /v2/reviews`)
  - `/tours`, `/tours/[serviceId]` -> `GET /v2/catalog/services`
  - `/reserve`, `/reserve/[id]/pay`, `/reserve/[id]/confirmation` -> `POST /v2/reservations` / `/tours`, **promo code entry** (`POST /v2/promos/validate`), deposit summary, `POST /v2/payments/submissions`
  - `/my-bookings` -> `GET /v2/me/bookings*`, `POST /v2/payments/*`, `POST /v2/reservations/{id}/cancel`; **leave a review** on the Completed tab (`POST /v2/reviews`)
  - `/guest/my-stay`, `/guest/map`, `/guest/services`, `/guest/account`, `/guest/sync`
  - In-app **notification bell** on every guest page (`/v2/notifications*`)
- Back office (role-gated — Front Desk / Manager / System Admin):
  - `/admin` -> dashboard widgets via `GET /v2/dashboard/*`
  - `/admin/units` -> `GET/PATCH /v2/units*`
  - `/admin/reservations` -> `GET /v2/reservations`, KPI tiles via `GET /v2/reservations/stats`; mark no-show
  - `/admin/walk-in` -> walk-in stay/tour (`POST /v2/reservations/walk-in` · `/tours`), promo entry
  - `/admin/check-in` -> `POST /v2/qr/verify`, `POST /v2/checkins`, `POST /v2/checkouts`
  - `/admin/payments` -> `GET/POST /v2/payments*`
  - `/admin/reports` -> `GET /v2/reports/overview` (incl. promo discount totals; print/CSV export)
  - `/admin/promos` -> `GET/POST/PATCH /v2/admin/promos` (Manager+)
  - `/admin/team` -> `GET/POST/PATCH /v2/admin/team` (System Admin)
  - `/admin/audit`, `/admin/blockchain`, `/admin/escrow`, `/admin/ai`, `/admin/sync`
  - Review moderation -> `GET/POST /v2/reviews/admin`; in-app notification bell in the admin header
