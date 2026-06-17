# Hillside Hidden Resort — Demo Runbook (5–10 Minutes)

References:
- [PROJECT_ALIGNMENT.md](C:/Users/Jackson/Desktop/capstone-hillside-hidden-resort/PROJECT_ALIGNMENT.md)
- [DEMO_ENV_CHECKLIST.md](C:/Users/Jackson/Desktop/capstone-hillside-hidden-resort/DEMO_ENV_CHECKLIST.md)

## 0) Pre-Flight (Before Panel)

1. Start services:
```powershell
npm run dev:api
npm run dev:ai
npm run dev:next
```

2. Confirm:
- API: `http://localhost:8000/health`
- App: `http://localhost:3000`

3. Verify demo narrative:
- Current chain: **Ethereum Sepolia**
- Future cutover: **Polygon L2**
- PII remains off-chain

---

## 1) Opening Statement (20–30s)

Say:

> Hillside Hidden Resort is a mobile-first, offline-capable PWA for booking, payment verification, and QR-based check-in.  
> Supabase stores operational data off-chain, FastAPI handles trusted validation logic, and Sepolia provides blockchain auditability for immutable proof references.

---

## 2) Guest Flow Demo (2–3 min)

## 2.1 Login and Guest Dashboard
- Open: `/login`
- Login with guest account
- Navigate: `/my-bookings`

Expected:
- “My Bookings” page loads
- Status tabs, search, sync center, and empty/booking state visible

## 2.2 Reservation + Payment Proof
- Go to `/book` (or use existing pending booking if prepared)
- Show reservation summary and required payment
- Submit payment proof from guest side (or show already submitted)

Expected:
- Payment status shows pending verification
- No backend errors in UI

## 2.3 QR Readiness
- Return to `/my-bookings`
- Open booking details / QR action

Expected:
- QR shows proper readiness state (not ready/pending/ready)
- No guest PII visible in QR payload UI

---

## 3) Admin Flow Demo (2–3 min)

## 3.1 Payment Verification
- Open: `/admin/payments`
- Verify the guest payment proof

Expected:
- Payment state changes to verified
- Reservation becomes eligible for check-in

## 3.2 QR Check-In Console
- Open: `/admin/check-in`
- Scan or validate guest QR token

Expected:
- QR signature/status validation succeeds
- Reservation transitions to checked-in
- Replay/expired handling appears if invalid token is tested

---

## 4) Blockchain + Auditability Demo (1–2 min)

## 4.1 Ledger/Blockchain View
- Open: `/admin/blockchain` (or `/admin/escrow`, `/admin/audit`)

Expected:
- Chain context reflects Sepolia
- Event/hash/transaction references visible where applicable
- Explain: only hashes/references on-chain; guest PII off-chain in Supabase

Suggested line:

> We use Sepolia now for development-grade immutable proof and transaction references.  
> Polygon L2 is our planned cutover for lower-cost production operations.

---

## 5) Offline/Sync Trust Demo (1–2 min)

## 5.1 Guest Sync Center
- Open: `/guest/sync`
- Briefly show queue/sync states

Optional live step:
- Simulate offline browser mode
- Trigger an action that queues
- Reconnect and run sync

Expected:
- UI shows queued → syncing → synced
- Clear offline status labels

---

## 6) AI Intelligence Demo (45–60s)

- Open: `/admin/ai` or AI-related widgets in admin pages
- Show forecasting/recommendation output

Expected:
- AI outputs are decision-support recommendations
- Admin remains final approver (no silent automatic business override)

---

## 7) Close (20–30s)

Say:

> The platform is production-shaped but capstone-focused: robust guest/admin workflows, offline-first operation, QR security, and blockchain-backed auditability on Sepolia today, with Polygon L2 prepared for future cutover.

---

## 8) Fast Fallback Script (If a Step Fails)

If any live step fails:
1. Show the relevant module page still loads.
2. Show API health endpoint.
3. Explain expected behavior from checklist.
4. Continue with next module (do not stall demo).

Fallback phrasing:

> This environment-dependent step relies on external chain/service connectivity.  
> The implemented flow and validation logic are present and verified in our integration checklist.

---

## 9) Panel Q&A Quick Answers

## Q: Why Sepolia and not Polygon now?
A: Sepolia is the active integrated demo chain. Polygon L2 remains the planned cutover target for production cost efficiency.

## Q: Do you store personal data on-chain?
A: No. Guest PII remains in Supabase. Blockchain stores only hashes, references, and immutable audit proofs.

## Q: What happens offline?
A: The PWA supports cached state and queued actions with sync recovery via Sync Center.

## Q: Is AI fully automatic?
A: No. AI provides recommendations/forecasts; admin approval remains required.

