# Demo & Test Plan

Last updated: 2026-02-25

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
5. Auth + reservation smoke (guest token required):
```powershell
$headers = @{ Authorization = "Bearer $guestToken" }
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8000/v2/me/bookings?tab=pending_payment" -Headers $headers
```
6. NFT guest pass verify (guest or admin token):
```powershell
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8000/v2/nft/guest-pass/<reservation_id>" -Headers $headers
```
7. Occupancy forecast (admin token):
```powershell
$headers = @{ Authorization = "Bearer $adminToken" }
$body = @{ start_date = "2026-02-24"; horizon_days = 7; history_days = 30 } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8000/v2/ai/occupancy/forecast" -Headers $headers -ContentType "application/json" -Body $body
```
8. Sepolia reliability smoke:
```powershell
.\docs\re-architecture-core\scripts\sepolia-reliability-smoke.ps1 `
  -ApiBaseUrl "http://127.0.0.1:8000" `
  -LoopCount 10 `
  -SupabaseUrl "https://<project-ref>.supabase.co" `
  -SupabasePublishableKey "<publishable-key>" `
  -AdminEmail "<admin-email>" `
  -AdminPassword "<admin-password>"
```

## Latest Sepolia Reliability Evidence

Evidence file: `docs/re-architecture-core/sepolia-reliability-report.json`

Latest run snapshot (generated `2026-02-25T23:29:17.9279047+08:00`):

1. `loop_count = 10`
2. `success_count = 10`
3. `success_rate = 100`
4. `active_chain.key = sepolia`
5. `escrow_reconciliation_monitor.alert_active = false`

Verification command:

```powershell
$report = Get-Content .\docs\re-architecture-core\sepolia-reliability-report.json -Raw | ConvertFrom-Json
$report | Select-Object generated_at, loop_count, success_count, success_rate
$report.runs | Where-Object { $_.error -or -not $_.create_ok -or -not $_.guest_pass_ok -or -not $_.checkin_ok -or $_.reconciliation_alert }
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

## Release Operations

1. Baseline tag exists and points to the green release gate run (`v0.9.0-rc1`).
2. Branch protection on `master` must require these checks:
   - `web-validate`
   - `api-validate (3.11)`
   - `api-validate (3.12)`
   - `release-gate-core`
   - `release-gate-sepolia-smoke`
3. Feature freeze rule: merge only release blockers while validating a release candidate.
4. Secrets hygiene before each release candidate:
   - rotate signing keys/private keys if they were exposed in logs or screenshots
   - re-save GitHub Actions secrets without trailing whitespace/newlines
   - verify `ESCROW_RECONCILIATION_CHAIN_KEY=sepolia` for testnet release gates
5. Manual demo pass must complete end-to-end:
   - booking creation
   - payment submission and verification
   - NFT guest pass verification
   - QR check-in
   - reconciliation monitor run with no alert

## Rollback Playbook

1. Identify last known-good release tag:
```powershell
git tag --sort=-creatordate | Select-Object -First 5
```
2. Roll back deployment target to previous good tag (example):
```powershell
git checkout v0.9.0-rc1
```
3. Re-run release validation for the rollback candidate:
   - `release-gate-core`
   - `release-gate-sepolia-smoke`
4. Confirm health and critical paths after rollback:
```powershell
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8000/health"
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8100/health"
```
5. Record rollback event in project docs:
   - failure trigger
   - restored tag/commit
   - time to recovery
   - follow-up corrective action

## Defense Checklist

1. Chain strategy is explicit: Sepolia for development, Polygon Amoy as target/cutover.
2. Escrow flow is consistent in docs and runtime (release at check-in).
3. Offline queue uses AES-256 encrypted IndexedDB (not plaintext localStorage).
4. NFT guest pass exists (ERC721), mint is feature-flagged and non-blocking.
5. Guest pass verification endpoint is available for admin/guest owner checks.
6. AI stack includes scikit-learn and provides persisted occupancy forecast output.
7. PII remains off-chain; only reservation hash and token metadata are used.
8. ZKP is explicitly deferred as future work (out of current scope).
