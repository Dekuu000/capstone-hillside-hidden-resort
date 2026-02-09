# Phase 5 - Offline Scan Queue Plan

Goal: allow admins to scan QR codes when offline, queue them locally, and sync for server-side validation once online. No offline action should bypass server rules.

## Design Principles
- Online-first: real-time validation when connectivity exists.
- Offline fallback: queue scans locally, then re-validate on sync.
- Server is source of truth for check-in permissions.
- Every override must still require reason and produce audit logs.

## Data Model (Client-Side Queue)
Store in localStorage or IndexedDB (preferred for scale).
- id: string (uuid)
- reservationCode: string
- scannedAt: ISO timestamp
- deviceId: string (generated once, stored locally)
- status: queued | syncing | succeeded | failed
- lastError: string | null

## Offline Flow
1. Admin scans QR while offline.
2. App shows “Queued for sync” with timestamp.
3. Queue entry created locally.
4. No status change until online sync succeeds.

## Online Sync Flow
1. Detect online (navigator.onLine + periodic retries).
2. For each queued item:
   - Call validate_qr_checkin(reservationCode)
   - If allowed or override needed:
     - If allowed: call perform_checkin(reservation_id)
     - If override needed: require admin reason before sync
   - Mark queue entry as succeeded or failed with error.
3. Stop syncing on auth failure or network error and retry later.

## Admin Override Handling (Offline)
- If scan requires override, queue it as “needs_reason”.
- When back online, prompt admin for reason before calling perform_checkin.
- Log audit action override_checkin with reason.

## UI Requirements
- Show “Offline: scans will be queued” banner.
- Show queued scans count (badge).
- Provide a queue view with:
  - reservation code
  - scanned time
  - status and error
- Provide a “Sync now” action.

## Error Handling
- Invalid code or reservation not found: mark failed, show reason.
- Already checked in: mark failed, show reason.
- Payment required: mark failed, show reason + suggest verify payment or override.

## Security
- Never store sensitive info in the queue.
- Only store reservation code and timestamps.
- Use authenticated RPCs when syncing.

## Implementation Steps
1. Add queue module (lib/offlineQueue.ts) with add, list, update, remove.
2. Add UI banner and queued badge (Admin Scan page).
3. Add background sync worker (simple interval + online event).
4. Add queue detail view (optional modal).
5. Extend audit logs for offline sync actions (same RPCs).

## Test Checklist
- Offline scan adds queue item and shows badge.
- Reconnect triggers sync and clears queue.
- Invalid code stays failed with error message.
- Override required prompts reason before sync.
