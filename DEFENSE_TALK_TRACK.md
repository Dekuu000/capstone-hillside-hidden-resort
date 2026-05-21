# Hillside Hidden Resort — Defense Talk Track

## 1) Opening (20–30 seconds)

Good day, panel.  
Our capstone is **Hillside Hidden Resort**, a **mobile-first, offline-capable PWA** for reservation management and QR-based guest check-in.  
The system combines:
- **Next.js 15 PWA** for guest and admin interfaces,
- **FastAPI** as the trusted backend,
- **Supabase** for off-chain operational data,
- **AI forecasting/recommendation** for decision support,
- and **blockchain auditability on Ethereum Sepolia** for immutable proof references.

---

## 2) Architecture Positioning (30–40 seconds)

This is a **Web3-hybrid architecture**, not a fully on-chain app.

- **Supabase** stores guest and operational data.
- **Blockchain** stores only privacy-safe proofs like hashes and transaction references.
- **FastAPI** enforces validation, QR security, business flow, and privileged operations.
- **PWA** provides usability, offline trust, and mobile-first access.

Important note:  
We currently use **Ethereum Sepolia** for development and demonstration.  
**Polygon L2** is retained as the **future cutover target** for lower-cost production deployment.

---

## 3) Privacy and Security (30–40 seconds)

We keep **guest PII off-chain**.

Never stored on-chain:
- guest name, email, phone, payment proof images, and personal details.

On-chain-linked records are limited to:
- reservation/payment/check-in related hashes,
- transaction references,
- immutable audit proof metadata.

This gives us auditability without exposing personal information.

---

## 4) Demo Flow Narrative (2–3 minutes)

### Guest Side
1. Guest logs in and accesses **My Bookings / My Stay**.
2. Guest creates or views reservation.
3. Guest submits payment proof.
4. Guest sees booking status and QR readiness.

### Admin Side
1. Admin verifies payment proof.
2. Admin opens check-in console and scans/verifies QR.
3. System validates signature, booking state, and timing rules.
4. Reservation status updates to checked-in; audit trail is created.

### Blockchain/Audit View
1. Admin opens blockchain/ledger-related view.
2. Shows transaction/hash references for immutable verification context.

---

## 5) Offline Capability (45–60 seconds)

The PWA is offline-aware:
- Guest can still open installed app and view cached states where supported.
- QR and reservation-related actions have offline-safe behavior.
- Admin/guest queued operations are managed by **Sync Center**.
- On reconnect, queued actions sync and statuses update clearly.

This is important for real resort environments with unstable connectivity.

---

## 6) AI Module Position (30–40 seconds)

AI in this system is **decision support**, not autonomous control.

Current direction:
- occupancy forecasting,
- demand trend prediction,
- pricing recommendation.

Admin remains final approver for business-impacting changes.

---

## 7) Scope Discipline (20–30 seconds)

For MVP, we focused on reliable core operations:
- booking,
- payment verification,
- QR check-in,
- sync/offline trust,
- reporting and auditability.

Advanced items like full ZKP, production escrow automation, and full NFT expansion are future enhancements and are intentionally non-blocking for current capstone delivery.

---

## 8) Closing (20–30 seconds)

In summary, Hillside Hidden Resort delivers a practical, secure, and modern resort platform:
- mobile-first,
- offline-capable,
- QR-driven check-in,
- AI-assisted operations,
- and blockchain-backed auditability on Sepolia,
with Polygon L2 ready as the future production path.

Thank you.

---

## 9) Quick Q&A Answers

**Q: Why Sepolia now?**  
A: Sepolia is our active integrated demo chain; Polygon L2 is our planned production cutover target.

**Q: Is personal data on-chain?**  
A: No. PII remains in Supabase. Blockchain holds hashes/references only.

**Q: What if internet is unstable?**  
A: The PWA supports offline-aware operation with queue and sync recovery via Sync Center.

**Q: Does AI auto-change pricing?**  
A: No. AI provides recommendations; admin approval is required.

