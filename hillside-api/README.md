# hillside-api (FastAPI V2)

FastAPI domain service scaffold for phased migration from Supabase RPC-heavy flows to explicit v2 APIs.

## Purpose

- Serve canonical `/v2/*` APIs for reservations, payments, QR/check-in, and reports/AI.
- Keep Supabase as source-of-truth during initial waves.
- Integrate with EVM escrow (Sepolia/Amoy) and AI services behind feature flags.
- Read schema/function contracts from repo root `../supabase`.

## Local Run

```bash
cd hillside-api
python -m venv .venv
.venv\\Scripts\\activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

Health check:

- `GET /health`

Set CORS allowlist in `.env`:

- `API_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000`

Current v2 route groups:

- Auth/session:
  - `POST /v2/auth/session`
  - `GET /v2/auth/context`
- Reservations:
  - `GET /v2/reservations`
  - `GET /v2/reservations/{reservation_id}`
  - `POST /v2/reservations`
  - `POST /v2/reservations/tours`
  - `POST /v2/reservations/{reservation_id}/cancel`
- Payments:
  - `GET /v2/payments`
  - `GET /v2/payments/reservations/{reservation_id}`
  - `POST /v2/payments/submissions`
  - `POST /v2/payments/{payment_id}/verify`
  - `POST /v2/payments/{payment_id}/reject`
- Operations/QR:
  - `POST /v2/qr/verify`
  - `POST /v2/qr/issue`
  - `POST /v2/checkins`
  - `POST /v2/checkouts`
  - `GET /v2/chains`
- Escrow diagnostics:
  - `GET /v2/escrow/reconciliation`
  - Returns item list plus summary counters (`match`, `mismatch`, `missing_onchain`, `skipped`, `alert`).
  - `POST /v2/escrow/cleanup-shadow`
  - Admin-only helper for stale shadow cleanup candidates (`pending_lock` + `chain_tx_hash like 'shadow-%'`).
  - Default dry-run (`execute=false`); set `execute=true` to clear metadata safely with strict row guards.
  - `GET /v2/escrow/reconciliation-monitor`
  - `POST /v2/escrow/reconciliation-monitor/run`
  - Monitor latest scheduler run summary and trigger a manual run (admin only).
- Admin metrics:
  - `GET /v2/reports/overview`
  - `GET /v2/reports/transactions`
  - `GET /v2/audit/logs`
  - `GET /v2/dashboard/summary`
  - `GET /v2/dashboard/perf`
  - `GET /v2/units`
  - `POST /v2/units`
  - `PATCH /v2/units/{unit_id}`
  - `DELETE /v2/units/{unit_id}`
  - `PATCH /v2/units/{unit_id}/status`
- Catalog/guest:
  - `GET /v2/catalog/services`
  - `GET /v2/catalog/units/available`
- AI placeholder:
  - `POST /v2/ai/pricing/recommendation`
  - `POST /v2/ai/pricing/predict`
  - `POST /v2/ai/occupancy/forecast` (admin; persists results)
  - `GET /v2/ai/pricing/metrics` (admin)
- NFT guest pass:
  - `GET /v2/nft/guest-pass/{reservation_id}`

## Multi-chain configuration

Use these envs to switch chain without code refactor:

- `CHAIN_ACTIVE_KEY=sepolia|amoy`
- `CHAIN_ALLOWED_KEYS=sepolia,amoy`
- `EVM_RPC_URL_SEPOLIA`, `EVM_RPC_URL_AMOY`
- `ESCROW_CONTRACT_ADDRESS_SEPOLIA`, `ESCROW_CONTRACT_ADDRESS_AMOY`
- `GUEST_PASS_CONTRACT_ADDRESS_SEPOLIA`, `GUEST_PASS_CONTRACT_ADDRESS_AMOY`

Current development default:

- Active chain: `sepolia`
- Backup/retained chain config: `amoy`

Escrow shadow-write (Wave 2 kickoff):

- Enable with `FEATURE_ESCROW_SHADOW_WRITE=true`.
- When enabled and chain config is valid, reservation creation stores chain metadata (`escrow_state`, `chain_key`, `chain_id`, `chain_tx_hash`, `onchain_booking_id`) as a non-blocking shadow write.

Real on-chain lock (Wave 2 next step):

- Enable with `FEATURE_ESCROW_ONCHAIN_LOCK=true` (and keep `FEATURE_ESCROW_SHADOW_WRITE=true`).
- Requires `ESCROW_SIGNER_PRIVATE_KEY_<CHAIN>` for the active chain.
- Uses `ESCROW_LOCK_AMOUNT_WEI` for the lock transaction value (default `1` wei for dev).
- Wait timeout is configurable via `ESCROW_TX_RECEIPT_TIMEOUT_SEC`.

NFT guest pass (Wave 2 extension):

- Enable with `FEATURE_NFT_GUEST_PASS=true`.
- Requires active chain signer + `GUEST_PASS_CONTRACT_ADDRESS_<CHAIN>`.
- Mint is non-blocking on reservation create:
  - failures are logged but reservation creation remains successful.
- On-chain payload uses reservation hash only (no guest PII).

Payments submission guardrail:

- `POST /v2/payments/submissions` now requires `proof_url` and returns `400` early when missing.

Dynamic QR (Wave 3 kickoff):

- Enable with `FEATURE_DYNAMIC_QR=true`.
- Configure:
  - `QR_SIGNING_SECRET`
  - `QR_ROTATION_SECONDS` (default 30)
  - `QR_VERIFY_LEEWAY_SECONDS` (default 5)
- `POST /v2/qr/issue` generates signed rotating token payload.
- `POST /v2/qr/verify` accepts either:
  - legacy `reservation_code`, or
  - dynamic `qr_token` payload.
- Anti-replay:
  - Tokens are stored in `public.qr_tokens`.
  - Reuse is blocked with `409` (`QR token already used`).

AI pricing integration (Wave 4 bootstrap):

- `POST /v2/ai/pricing/recommendation` is the canonical route.
- `POST /v2/ai/pricing/predict` is retained as compatibility alias.
- Timeout budget is controlled by `AI_INFERENCE_TIMEOUT_MS` (up to 10s hard cap).
- AI failures/timeouts do not block booking creation; fallback recommendation path is used.
- AI runtime snapshot endpoint:
  - `GET /v2/ai/pricing/metrics`
  - Returns total requests, fallback rate, last fallback reason/time, and latency summary.
- Occupancy forecasting endpoint:
  - `POST /v2/ai/occupancy/forecast`
  - Pulls reservation history, calls AI service `/v1/occupancy/forecast`, persists rows in `public.ai_forecasts`.
- To run a local live AI service:
  - `npm run dev:ai` (root) or `uvicorn app.main:app --reload --port 8100 --app-dir hillside-ai`
  - Keep `AI_SERVICE_BASE_URL=http://localhost:8100`

Reconciliation scheduler (Wave 2 operations):

- `FEATURE_ESCROW_RECONCILIATION_SCHEDULER=true` to enable startup background loop.
- `ESCROW_RECONCILIATION_INTERVAL_SEC` controls run interval (minimum runtime clamp: 30s).
- `ESCROW_RECONCILIATION_LIMIT` controls per-run scan window.
- `ESCROW_RECONCILIATION_CHAIN_KEY` optionally overrides active chain for scheduler scans.
- Alert thresholds:
  - `ESCROW_RECONCILIATION_ALERT_MISMATCH_THRESHOLD`
  - `ESCROW_RECONCILIATION_ALERT_MISSING_ONCHAIN_THRESHOLD`
  - `ESCROW_RECONCILIATION_ALERT_SKIPPED_THRESHOLD`
