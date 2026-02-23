# Demo & Test Plan

## Runnable demo path (PowerShell)

1. Start FastAPI (`hillside-api`):
```powershell
cd hillside-api
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --env-file .env
```
2. Start AI service (`hillside-ai`):
```powershell
cd hillside-ai
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8100 --env-file .env
```
3. Start Next.js app (`hillside-next`):
```powershell
cd hillside-next
npm run dev
```
4. Health check:
```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/health"
```
5. Auth + reservation smoke (guest token required):
```powershell
$headers = @{ Authorization = "Bearer $guestToken" }
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/v2/me/bookings?tab=pending_payment" -Headers $headers
```
6. NFT guest pass verify (guest or admin token):
```powershell
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method GET -Uri "http://localhost:8000/v2/nft/guest-pass/<reservation_id>" -Headers $headers
```
7. Occupancy forecast (admin token):
```powershell
$headers = @{ Authorization = "Bearer $adminToken" }
$body = @{ start_date = "2026-02-24"; horizon_days = 7; history_days = 30 } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/v2/ai/occupancy/forecast" -Headers $headers -ContentType "application/json" -Body $body
```

## Smoke checks

1. Legacy app still starts (`hillside-app`).
2. Next.js shell starts (`hillside-next`).
3. FastAPI health endpoint responds (`/health`).
4. Contracts workspace compiles.

## Functional checkpoints

1. Booking creation via V2 API works with authenticated user.
2. My Bookings list loads from `/v2/me/bookings`.
3. Admin Reservations list loads from `/v2/reservations`.
4. Payment submission and review transitions are deterministic.
5. NFT guest pass verify endpoint returns deterministic status.
6. Occupancy forecast endpoint writes rows to `public.ai_forecasts`.

## Security checks

1. Unauthorized API call returns 401/403.
2. Admin-only endpoint blocks guest roles.
3. QR tamper/replay payload rejected.
4. On-chain payload carries reservation hash/IDs only (no PII).
5. Offline QR queue remains encrypted at rest (IndexedDB AES-256).

## Performance checks

1. Initial list endpoint P95 latency under target.
2. Cursor pagination returns stable, non-duplicated rows.
3. Frontend route transitions keep perceived loading feedback.

## Defense Checklist

1. Chain strategy is explicit: Sepolia for development, Polygon Amoy as target/cutover.
2. Escrow flow is consistent in docs and runtime (release at check-in).
3. Offline queue uses AES-256 encrypted IndexedDB (not plaintext localStorage).
4. NFT guest pass exists (ERC721), mint is feature-flagged and non-blocking.
5. Guest pass verification endpoint is available for admin/guest owner checks.
6. AI stack includes scikit-learn and provides persisted occupancy forecast output.
7. PII remains off-chain; only reservation hash and token metadata are used.
8. ZKP is explicitly deferred as future work (out of current scope).
