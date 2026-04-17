# Demo & Test Plan

Last updated: 2026-03-06

## Runnable demo path (PowerShell)

1. Start FastAPI (`hillside-api`):
```powershell
cd hillside-api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --env-file .env
```
2. Start AI service (`hillside-ai`):
```powershell
cd hillside-ai
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8100
```
3. Start Next.js app (`hillside-next`):
```powershell
cd hillside-next
npm run dev
```
4. Health checks:
```powershell
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8000/health"
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8100/health"
```

## Module C demo steps (AI Hospitality Intelligence)

1. Open `http://localhost:3000/admin/ai`.
2. Pricing tab:
- Click **Refresh metrics** (`GET /v2/ai/pricing/metrics`).
- Click **Generate recommendation** (`POST /v2/ai/pricing/recommendation`).
- Review reasons and confidence.
- Click **Apply recommendation** (`POST /v2/ai/pricing/apply`).
3. Forecast tab:
- Click **Generate new forecast (14 days)** (`POST /v2/ai/occupancy/forecast`).
- Verify model/source and trend output.
4. Concierge tab:
- Select `segment_key`.
- Click **Generate concierge suggestions** (`POST /v2/ai/concierge/recommendation`).
- Verify suggestions and "Why suggested" bullets.

## Module D demo steps (Resort Management Dashboard)

1. Open `http://localhost:3000/admin`.
2. Verify **Resort Snapshot** cards:
- Occupancy now (`occupied/active` + occupancy %)
- FIAT revenue (PHP, last 7 days)
- Crypto revenue (ETH total + tx count)
- AI demand next 7 days (trend + model/version)
3. Validate degraded state behavior:
- Stop AI service or clear forecasts and confirm demand status becomes `missing` without page crash.
4. Room Management quick form:
- Search/select a unit.
- Update amenities, base rate, availability, and operational status.
- Save and confirm toast + persisted update.
5. Guest Verification launcher:
- Open scanner: `/admin/check-in?mode=scan`
- Open code fallback: `/admin/check-in?mode=code`
- Open tablet layout: `/admin/check-in?view=tablet&mode=scan`
- Confirm check-in flow remains functional.

## Blockchain Explorer demo steps (Internal)

1. Open `http://localhost:3000/admin/blockchain`.
2. `Contract Status` tab:
- Change `chain` and `window` controls, verify refetch.
- Confirm KPI cards:
  - gas fees (`base / priority`)
  - successful transactions (escrow-only)
  - pending escrows (`pending_lock`)
- Verify recent tx table links open explorer hash pages.
3. Gas fallback behavior:
- Temporarily break RPC or disable network.
- Confirm gas state shows `cached` or `unavailable` without crashing page.
- Confirm tx/pending metrics still render from database.
4. `Audit Logs` tab:
- Default view is reservation-focused logs.
- Apply search/action/date filters and verify results update.
- Open row details drawer and inspect metadata/hash values.
5. Backward compatibility:
- Open `/admin/escrow` and `/admin/audit-logs`; both remain functional.

## Interface Design Outline (Sitemap) demo steps (Guest Portal Upgrade)

1. Booking form (`/book`):
- Select `Room Type`.
- Set `Guest Count`.
- Verify submit is blocked when selected capacity is below `guest_count`.
- Optionally connect wallet, refresh page, and confirm profile persistence.
- Confirm booking still works when wallet is not connected.
- Submit reservation and confirm API payload stores `guest_count`.
2. My Stay (`/guest/my-stay`):
- Verify countdown card, room display fallback, and QR action button.
- Open QR modal and validate online token refresh + offline cached token behavior.
3. Explore (`/guest/map`):
- Verify trail/facility filters, pin selection, and manual "You are here" routing.
- Verify map still works offline from cached shell/data.
4. Resort Services (`/guest/services`):
- Submit request with reservation link.
- Submit request without reservation link.
- Verify timeline status rendering.
5. Admin Services Queue (`/admin/services`):
- Filter by status/category/search.
- Open drawer and update status to `in_progress`, `done`, `cancelled`.
- Confirm guest timeline reflects updates.

## Functional checkpoints

1. Booking creation works with required `guest_count`.
2. `/v2/me/profile` GET/PATCH works for wallet upsert/clear.
3. My Stay shows room identifiers (`room_number`, `unit_code`) with fallback.
4. Guest service requests are created and listed with correct ownership.
5. Admin service queue updates status with deterministic transitions.
6. Existing tours, payments, check-in, and AI center flows remain intact.
7. `/v2/dashboard/resort-snapshot` returns stable payload with occupancy/revenue/ai_demand sections.
8. Dashboard no longer embeds legacy Ledger Explorer and Resource Heatmap blocks.
9. `/admin/blockchain` renders unified Contract Status + Audit Logs tabs without breaking existing pages.

## Security checks

1. Unauthorized API calls return 401/403.
2. Admin-only endpoints block guest roles.
3. QR tamper/replay is rejected.
4. On-chain payloads contain no PII.
5. Offline check-in queue remains encrypted in IndexedDB.
6. Guest service requests obey RLS ownership/admin policies.

## Offline checks

1. Admin check-in preload pack caches `today + tomorrow` arrivals.
2. Offline code validation works only with preload cache.
3. Offline queue stores action items and syncs deterministically when online.
4. `/guest/my-stay`, `/guest/map`, and `/guest/services` shell routes remain usable offline.

## Performance checks

1. Capture API perf snapshot:
```powershell
$headers = @{ Authorization = "Bearer $adminToken" }
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8000/v2/dashboard/perf" -Headers $headers
```
2. Confirm list endpoints remain responsive with pagination.
3. Confirm no major UI blocking during booking, QR, and services flows.
4. Dashboard snapshot load should remain under normal admin render budget with cache enabled.
5. `/v2/escrow/contract-status` cache window (30s) should keep repeated refreshes responsive.
