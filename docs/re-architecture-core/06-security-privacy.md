# Security & Privacy Baseline

## App-layer controls

- JWT validation in API layer for every `/v2/*` request.
- Role-based access rules for admin-only operations.
- Security headers in Next.js runtime.
- Env validation for required public/server variables.

## Data protection

- No PII on-chain.
- Use tokenized/hash references for chain linkage.
- Encrypt offline cache payloads with AES-256 (IndexedDB-backed queue for admin QR offline sync).
- Offline arrivals pack stores minimal fields only:
  - `reservation_code`, `reservation_id`, stay dates, status, payment summary
  - signed token metadata (`jti`, `expires_at`, `rotation_version`, `signature`)
  - pack metadata (`generated_at`, `valid_until`, `count`)
- Guest offline QR cache stores only last issued token per reservation in IndexedDB (no private keys, no service-role secrets).
- Guest wallet binding is optional and stored in `public.users.wallet_address` with EVM-format validation.
- Current phase: wallet is profile context only; reservation creation remains wallet-agnostic.
- Service request data remains in application DB only (no blockchain write path for room-service/spa requests).

## QR security

- Signed QR payload (Ed25519 preferred) with client-side public-key verification for offline scan UX.
- Rotation window is server-driven (`QR_ROTATION_SECONDS`); local/dev enforces a safer minimum window for testing.
- Replay rejection using nonce/jti tracking.
- Offline local validation is a gate for staff continuity, but authoritative verification remains server-side at sync/confirm time.
- Public key distribution:
  - `GET /v2/qr/public-key` returns verification key only (no signing secret/private key exposed).
- QR/NFT boundary:
  - NFT guest pass remains a ledger proof artifact.
  - Rotating QR token is the operational check-in credential.

## Offline validation model and limits

- Scan tab is offline-first:
  - local check uses preloaded arrivals pack + signed token fields
  - queued check-in/check-out actions sync once online
- Reservation-code tab is online-first:
  - offline code validation works only when a fresh arrivals pack was preloaded
  - without a pack, UI explicitly redirects staff to Scan flow
- Known limits:
  - Client cannot perform full HMAC-secret verification (secret remains server-side by design).
  - Offline decisions are operationally useful but not final; sync path is source of truth.

## Secret handling

- Keep private keys server-side only (`.env`, deployment secret manager).
- Never expose service-role or chain signer secrets to browser code.
- Wallet connection uses client-side provider (`window.ethereum`) only for address retrieval; private keys stay in guest wallet apps.

## Interface Design Outline privacy boundaries

- Room identity fields (`unit_code`, `room_number`) are operational metadata, not sensitive personal data.
- `guest_count` is stored for booking capacity enforcement and staffing analytics only.
- Wallet data is optional and can be empty for all guest flows in this phase.
- Resort service requests follow RLS boundaries:
  - guests can read/insert their own requests
  - admins can read/update all requests for operations handling

## Performance instrumentation

- API emits `x-api-latency-ms` and p95 sample headers for `/v2/*` routes.
- `/v2/dashboard/perf` exposes rolling API + DB timing snapshots for ops review.
- FastAPI uses short-lived in-memory TTL cache for read-heavy endpoints (rooms, dashboard, services).
