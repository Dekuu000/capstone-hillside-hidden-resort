# Offline-First Capstone Demo Test Script

## Test Setup
1. Start local stack:
   - `npm run db:start`
   - API: `cd hillside-api && .\.venv\Scripts\activate && python -m uvicorn app.main:app --reload --port 8000 --env-file .env`
   - Next: `cd hillside-next && npm run dev`
2. Open app online once and visit:
   - `/admin/walk-in`
   - `/admin/payments`
   - `/admin/reservations`
   - `/guest/my-stay`
   - `/guest/map`
   - `/admin/sync`
3. Confirm Sync Center status shows `Online`.

## Demo Scenarios (Action + Expected Result)

| # | Action | Expected Result |
|---|---|---|
| 1 | Go offline in DevTools (`Network > Offline`). | Offline banner appears and app shell remains available. |
| 2 | Open `/admin/walk-in`. Create a **Walk-in Stay**. | No hard error. Toast says saved offline. Queued operation message appears with operation id. |
| 3 | Open `/admin/walk-in`, switch to **Walk-in Tour**, submit. | No crash. Toast says saved offline. Operation queued for sync. |
| 4 | Open `/admin/reservations` and `/admin/payments` while still offline. | Cached table renders with visible `using cached data` + `last updated` label. |
| 5 | Open `/guest/my-stay` and `/guest/map` offline. | Cached bookings/map load; no browser dino/offline page. |
| 6 | Open `/admin/sync` while still offline. | Outbox count > 0. Status shows offline. |
| 7 | Try live-only actions offline (fresh QR issue, blockchain refresh, AI refresh). | Action is blocked gracefully with internet-required feedback (no hard crash). |
| 8 | Return online. Click **Run sync now** in Sync Center. | Outbox drains to 0, queued operations become applied. |
| 9 | Open `/admin/reservations` and search recent records. | Walk-in stay and walk-in tour appear with synced reservation codes. |
| 10 | Open `/admin/payments` using synced reservation id/code. | Payment form loads and can record payment normally. |
| 11 | Repeat sync click (idempotency check). | No duplicate reservation creation; operations stay applied/noop. |

## Quick Acceptance Checklist
- Walk-in create works online and offline.
- Offline create queues in outbox (not lost).
- Reconnect sync creates records exactly once.
- Admin can continue to Payments after sync.
- Sync Center clearly shows pending/applied/failed states.
- Cached read pages show freshness timestamp when serving offline data.
- Live-only actions fail gracefully with explicit internet-required UX.
