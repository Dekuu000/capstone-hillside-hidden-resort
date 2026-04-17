# Offline Capability Matrix (Core Workflows)

## Positioning
Hillside is **offline-capable for core operations**, not fully offline for every feature.

## Route Support
| Route | Offline behavior | Notes |
|---|---|---|
| `/guest/my-stay`, `/my-bookings` | Fully offline-capable (cached read + queued safe actions) | Shows cached freshness metadata. |
| `/guest/map` | Fully offline-capable | Map shell/assets from SW + amenities snapshot from IndexedDB fallback. |
| `/guest/services` | Offline-capable (cached shell, queue-safe requests where enabled) | Uses outbox status indicators in Sync Center. |
| `/admin/check-in` | Fully offline-capable with preload pack | Manual fallback uses cached arrivals/check-in data. |
| `/admin/walk-in` | Offline-capable | Safe mutations are queued through outbox and synced later. |
| `/admin/payments` | Cached read-only offline (if loaded before) | Payment list can render cached snapshot with last-updated label. |
| `/admin/reservations` | Cached read-only offline (if loaded before) | List/detail shows cached snapshot metadata when network is down. |
| `/admin/sync` | Offline-capable | Queue status and retry controls remain available. |

## Internet-Required Actions
- Fresh QR issuance
- Blockchain writes/reconciliation refresh
- Live AI refresh/generation
- New uncached file upload initiation

These actions must show clear feedback: internet required, queued-not-supported, or retry guidance.

## Queue/Sync Contract
- `pending`: queued/syncing
- `synced`: applied/noop acknowledged by server
- `failed`: retry or discard needed
- `conflict`: server-wins; refresh required

## Operator Guidance
1. Work normally online to warm route + data caches.
2. During outage, continue on offline-capable routes and queued actions.
3. Reconnect and use Sync Center (`/admin/sync` or `/guest/sync`) to verify drain to zero.
4. Review failed/conflict items explicitly; no silent drops are allowed.
