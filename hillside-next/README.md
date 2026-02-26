# hillside-next (V2 Shell)

Next.js 15 shell for the phased re-architecture.

## Purpose

- Host future guest/admin web surfaces.
- Provide incremental BFF utilities during migration.
- Integrate with FastAPI v2 endpoints and Supabase auth/session.
- Validate Supabase session bootstrap and FastAPI health connectivity in Wave 0.
- Use Tailwind CSS (v4) for V2 page styling.
- Use shared Supabase schema/functions from repo root `../supabase`.

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

## Current V2 Slices

- Guest:
  - `/book` -> `GET /v2/catalog/units/available`, `POST /v2/reservations`
  - `/tours` -> `GET /v2/catalog/services`, `POST /v2/reservations/tours`, `POST /v2/payments/submissions`
  - `/my-bookings` -> `GET /v2/me/bookings`, `GET /v2/me/bookings/{id}`, `POST /v2/payments/*`, `POST /v2/reservations/{id}/cancel`
- Admin:
  - `/admin` -> dashboard widgets via `GET /v2/dashboard/summary`
  - `/admin/units` -> `GET/PATCH /v2/units*`
  - `/admin/reservations` -> `GET /v2/reservations`
  - `/admin/walk-in-tour` -> `GET /v2/catalog/services`, `POST /v2/reservations/tours` (`is_advance=false`)
  - `/admin/check-in` -> `POST /v2/qr/verify`, `POST /v2/operations/checkins`, `POST /v2/operations/checkouts`
  - `/admin/payments` -> `GET/POST /v2/payments*`
  - `/admin/reports` -> `GET /v2/reports/overview`
  - `/admin/audit` -> `GET /v2/audit/logs`
