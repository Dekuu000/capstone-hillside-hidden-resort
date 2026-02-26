# API Core (FastAPI V2)

## Endpoint groups

- `Auth`: `/v2/auth/*`
- `Reservations`: `/v2/reservations`, `/v2/me/bookings`
- `Payments`: `/v2/payments/*`
- `QR/Check-in`: `/v2/qr/*`, `/v2/checkins/*`
- `AI/Reports`: `/v2/ai/*`, `/v2/reports/*`

## Contract principles

- Idempotent write paths where retry is expected.
- Deterministic status transitions.
- Authorization by Supabase bearer token + role context.
- Lean list DTOs, detailed views fetched on demand.

## Event model (planned)

- `reservation.created`
- `escrow.locked`
- `qr.issued`
- `checkin.verified`
- `settlement.completed`
