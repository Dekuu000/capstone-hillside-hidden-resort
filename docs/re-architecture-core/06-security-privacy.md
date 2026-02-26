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

## QR security

- Signed QR payload.
- Rotation window target: 30 seconds.
- Replay rejection using nonce/jti tracking.

## Secret handling

- Keep private keys server-side only (`.env`, deployment secret manager).
- Never expose service-role or chain signer secrets to browser code.

## Performance instrumentation

- API emits `x-api-latency-ms` and p95 sample headers for `/v2/*` routes.
- `/v2/dashboard/perf` exposes rolling API + DB timing snapshots for ops review.
- FastAPI uses short-lived in-memory TTL cache for read-heavy endpoints (rooms, dashboard, services).
