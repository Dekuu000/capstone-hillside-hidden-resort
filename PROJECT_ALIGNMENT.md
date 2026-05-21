# Hillside Hidden Resort — Project Alignment Guide

## 1. Purpose of This Document

This document aligns the actual implementation of the **Hillside Hidden Resort PWA** with the development guide titled:

**A Blockchain-Enabled Framework for QR-Based Guest Check-In and Reservation Management with AI and PWA for Hillside Hidden Resort**

The development guide describes a Web3-hybrid resort management system where blockchain supports immutable reservation records, smart contract escrow concepts, and audit trails, while the PWA, backend, cloud database, and AI engine handle guest interactions, reservations, media, QR check-in, resort services, maps, reporting, and offline-first features.

This file should be treated as the main project alignment reference before making major architecture, backend, blockchain, AI, QR, offline, database, or UI changes.

---

## 2. Important Current Implementation Note

The development guide lists the blockchain layer as:

```txt
Polygon (L2) / Solidity

However, the current active web application uses:

Ethereum Sepolia
Current Blockchain Direction
Current development/demo chain: Ethereum Sepolia
Future cutover target: Polygon L2 / Polygon Amoy / production Polygon network
Smart contract language: Solidity
Web3 bridge: ethers.js
Required Documentation Wording

Use this wording consistently in README files, architecture notes, defense materials, and Codex prompts:

The system currently uses Ethereum Sepolia for blockchain development and demonstration. Polygon L2 is retained as the future deployment target for lower-cost smart contract operations.
Why This Matters

Sepolia is the current active chain for development and demo because it is already integrated into the live web app. Polygon L2 remains aligned with the development guide as the future production/cutover target.

3. As-Built Technical Stack
Layer	Current / Target Technology	Project Role
Frontend	Next.js 15 PWA	Guest portal, admin dashboard, offline-first UI, QR display, booking flow
Backend	FastAPI Python	Reservation APIs, QR signing/verification, AI endpoints, blockchain bridge logic
Database / Cloud Storage	Supabase Postgres/Auth/Storage	Off-chain guest profiles, reservations, payment proofs, unit media, operational records
Blockchain	Sepolia now, Polygon L2 later	Immutable reservation ledger, smart contract escrow concept, audit proof, transaction reference
Web3 Bridge	ethers.js	Connects the PWA/backend to deployed contracts and blockchain records
AI Engine	Prophet / scikit-learn	Pricing recommendation, occupancy forecasting, demand prediction
PWA / Offline	Service worker, IndexedDB/cache where applicable	Offline map, cached QR, queued actions, Sync Center
4. Core System Principle

This is a Web3-hybrid PWA, not a fully on-chain application.

The system should follow this rule:

Guest-facing and operational data stay off-chain.
Only hashes, proofs, transaction references, escrow references, and immutable audit records go on-chain.

The practical system boundary is:

Supabase = source of guest and operational data
Blockchain = source of immutable proof and auditability
FastAPI = trusted backend logic layer
Next.js PWA = guest/admin user interface
5. Privacy and Blockchain Boundary
Must Stay Off-Chain

The following must never be stored directly on-chain:

- Guest full name
- Email address
- Phone number
- Address
- Payment proof images
- Valid IDs
- Private guest notes
- Room service requests containing personal details
- Any sensitive guest profile information
Allowed On-Chain / Blockchain-Linked Data

Only privacy-safe references may be stored or anchored:

- Reservation hash
- Booking reference hash
- QR token hash
- Payment verification event hash
- Check-in event hash
- Cancellation event hash
- Escrow status reference
- Transaction hash
- Contract event ID
Recommended Privacy Rule
Supabase is the source of guest data.
Blockchain is the source of immutable proof.
Recommended Documentation Wording
The blockchain layer stores only reservation hashes, transaction references, and audit proofs. Guest names, contact details, payment proof images, and personal information remain off-chain in Supabase.
6. MVP vs Future Enhancement
MVP Features to Build Now

These are the core capstone-ready features.

Guest PWA
- Guest registration/login
- Guest booking flow
- Date and unit selection
- Guest count
- Payment proof upload
- My Bookings / My Stay dashboard
- QR status display
- Dynamic QR display when booking is approved
- Resort map
- Resort services
- Sync Center / offline status
- Mobile-first responsive UI
Admin Dashboard
- Admin overview / resort snapshot
- Reservation management
- Payment proof verification
- Guest QR verification/check-in
- Unit/room/amenity management
- Basic revenue and occupancy reporting
- Audit logs
- Ledger explorer / blockchain transaction references
QR Check-In
- Signed QR token generation
- Dynamic QR refresh behavior where applicable
- QR verification endpoint
- Admin scanner / verification console
- Reservation status update after successful scan
- Offline-friendly cached QR display
- Offline queue support for admin-side check-in where available
Blockchain / Sepolia Demo
- Sepolia-based smart contract or event ledger demo
- Reservation/check-in/payment event hashing
- Transaction hash display in admin ledger
- Immutable audit concept
- No guest PII stored on-chain
AI MVP
- Occupancy forecasting
- Demand trend prediction
- AI-assisted pricing recommendation
- Admin approval before applying pricing changes
7. Future Enhancements

These should not block the MVP unless specifically required by the adviser, panel, or project defense requirements.

- Full production smart contract escrow
- NFT guest passes
- Full zero-knowledge proof implementation
- Fully automated AI dynamic pricing
- Custodial wallet system
- Production Polygon mainnet deployment
- Crypto payment processing with real funds
- Advanced personalized concierge engine
- Full AES-256 offline encrypted vault for all offline guest data
Important Future Enhancement Note

The development guide includes concepts such as NFT guest passes, smart contract escrow, and ZKP. These are valid future directions, but they should not delay the current working PWA MVP unless they are explicitly required for the capstone defense.

8. Recommended Real System Flow

Use this as the actual implementation flow.

Phase 1 — Booking
Guest selects date, unit, guest count, and submits reservation request.
Reservation is stored in Supabase.
Phase 2 — Payment Proof
Guest pays the required online deposit through the supported payment method.
Guest uploads payment proof.
Payment proof is stored in Supabase Storage.
Payment record is linked to the reservation.
Phase 3 — Admin Verification
Admin reviews the payment proof.
If valid, admin marks payment as verified.
Reservation becomes approved/confirmed.
Phase 4 — QR Issuance
System generates a signed QR token linked to the reservation.
QR should contain only a signed token/hash/reference.
QR must not contain raw guest personal information.
Phase 5 — Guest Arrival
Guest opens the PWA and shows the QR code.
If offline, the PWA may show the latest cached QR/pass where supported.
Phase 6 — QR Validation
Admin scans guest QR.
FastAPI verifies:
- token signature
- reservation status
- payment verification status
- date/time validity
- replay/expiry rules
Phase 7 — Check-In
If valid, reservation status changes to checked-in/occupied.
System creates an audit log.
System may create or anchor a hash on Sepolia.
Phase 8 — Checkout / Settlement
Reservation is marked completed after checkout.
Revenue/reporting updates.
Future smart contract settlement may happen on Polygon.
9. QR Security Rules
QR Token Should Include
- reservation_id or booking reference
- token ID / jti
- issued_at
- expires_at
- rotation_version if dynamic QR is used
- signature
QR Token Should Not Include
- guest name
- email
- phone number
- payment proof
- address
- raw personal data
Recommended Verification
Backend verifies the QR token signature.
Backend checks reservation/payment/check-in state from Supabase.
Blockchain proof is optional for MVP but can be shown through ledger/audit logs.
Dynamic QR Direction
The dynamic QR should refresh periodically, such as every 30 seconds, when online.
For offline use, the app may display the last cached signed QR or offline pass if it is still valid.
QR UX Rule
Guests should clearly see whether the QR is:
- Not ready
- Pending payment verification
- Ready for check-in
- Expired
- Already used
- Offline cached
10. Offline-First Rules

The guide emphasizes offline check-in validation and offline resort navigation.

Required Offline-Friendly Features
- Guest can open installed PWA
- Guest can access My Stay / QR state where cached
- Guest can access resort map offline after assets are cached
- Admin scan/check-in actions can queue if offline where supported
- Sync Center shows queued/synced/failed states
Offline UX States

Use clear labels:

Online
Offline
Syncing
Saved offline
Waiting to sync
Sync failed
Synced successfully
Offline Data Privacy
Do not store unnecessary PII in browser storage.
If sensitive offline data is cached, minimize it and protect it where practical.
Offline Development Rule
Offline-first behavior must not be removed during UI redesigns.
Any UI change must preserve existing sync queue behavior, cached data behavior, and PWA installability.
11. AI Module Direction

The AI module should be implemented as AI-assisted resort intelligence, not fully autonomous business control.

MVP AI Features
- Occupancy forecasting
- Expected arrivals trend
- Demand prediction
- Pricing recommendation
- Admin review before applying recommended prices
Recommended AI Safety Rule
AI may recommend pricing changes, but admin must manually approve before prices are applied.
AI Inputs

Potential inputs:

- reservation history
- occupancy rate
- season/date
- day of week
- booking velocity
- tour demand
- unit availability
Future AI Inputs
- weather forecast
- local events
- guest preference patterns
- blockchain-confirmed arrival patterns
AI UX Direction
AI outputs should be shown as recommendations, forecasts, and decision-support insights.
Do not silently change guest prices without admin approval.
12. Admin Dashboard Direction

The admin dashboard should support resort operations, not only booking records.

Required Admin Areas
- Resort Snapshot
- Reservations
- Payment Verification
- QR Check-In Console
- Unit / Room / Amenity Management
- Guest Management
- Resort Services Requests
- AI Forecasting / Pricing Recommendations
- Ledger Explorer
- Audit Logs
Resort Snapshot Should Show
- today arrivals
- current occupancy
- pending payment verifications
- revenue
- upcoming bookings
- AI predicted demand
- QR check-in count
Ledger Explorer Should Show
- event type
- reservation reference
- event hash
- transaction hash
- chain used: Sepolia now
- status
- timestamp
Admin QR Check-In Console Should Support
- QR scanner
- Manual reservation code lookup
- Reservation validation result
- Payment verification status
- Check-in confirmation
- Offline queue indicator where applicable
- Audit log creation
13. Guest Portal Direction

The guest portal should be mobile-first.

Guest Routes
/book
/tours
/my-bookings
/guest/my-stay
/guest/map
/guest/services
/guest/profile
/guest/sync
/login
Guest Portal Should Prioritize
- easy booking
- payment proof submission
- booking status clarity
- QR readiness
- offline map
- resort services
- sync/offline trust
- mobile-first usability
Guest My Stay / My Bookings Should Show
- next stay date
- outstanding balance
- QR status
- reservation status tabs
- search
- Sync Center
- useful empty state
- primary action to book a stay
- secondary action to browse tours
Guest Booking Flow Should Show
- Select dates
- Choose unit
- Review payment
- Confirm booking
- Booking summary
- Minimum payment requirement
- Payment verification explanation
14. UI/UX Design Direction

The project design should follow this direction:

Modern premium resort feel:
- calm
- elegant
- high-clarity
- mobile-first
- clean white surfaces
- deep navy primary color
- teal accent
- soft orange CTA
- rounded cards
- subtle shadows
- strong action hierarchy
Existing Design Tokens
--color-primary: #0b1f3b;
--color-secondary: #0ea5a4;
--color-cta: #f97316;
--color-background: #f7fafc;
--color-surface: #ffffff;
--color-text: #0f172a;
Mobile-First Rules
- Start from 320px width.
- Then enhance for 375px, 390px, 430px, tablet, laptop, and desktop.
- No horizontal scrolling.
- Primary actions must be reachable with one hand.
- Cards stack on mobile.
- Desktop may use side panels and sticky summaries.
Guest Mobile UI Direction
- Compact header
- Premium deep navy hero card where appropriate
- Large rounded cards
- Full-width search fields
- Readable tabs with no text cut-off
- Sticky bottom navigation
- Clear active route state
- Strong primary CTA
- Enough bottom padding so nav does not cover content
Guest Desktop UI Direction
- Slim sticky top navigation
- Centered max-width layout
- Wide but controlled cards
- Hero sections should not be too tall
- Use 2-column layouts where helpful
- Sticky booking summaries on desktop booking flow
- Avoid stretched content on large screens
15. Map Direction

The guest map should prioritize internal resort wayfinding.

Recommended Map Approach
Primary: Custom offline-first resort map
Optional: External Google Maps link for directions to the resort
Why Not Google Maps as Main Internal Map
- Google Maps requires internet/API dependency
- Internal resort trails and amenities may not appear accurately
- Offline-first requirement is easier with a custom local map
- Custom map better supports resort-specific pins and directions
Map MVP Features
- Offline-first resort map
- Amenity pins
- Facility directory
- Manual “You are here” selector
- Text-based directions
- Cached map assets
16. Payment and Deposit Direction

The payment flow should remain practical and capstone-ready.

Current MVP Payment Flow
- Guest submits reservation
- Guest pays required deposit through supported payment method
- Guest uploads payment proof
- Admin verifies payment proof
- Booking becomes ready for QR/check-in
Payment Rules
Do not change existing reservation/payment/deposit business rules unless explicitly requested.
Payment UX Direction
- Explain why payment proof is required
- Show minimum online payment clearly
- Show payment status clearly
- Show what happens after admin verification
17. Blockchain Direction
Current Chain
Ethereum Sepolia
Future Chain
Polygon L2 / Polygon Amoy / production Polygon network
Blockchain MVP Purpose
- Demonstrate immutable auditability
- Show transaction/hash references
- Support smart contract escrow concept
- Avoid storing guest PII on-chain
Blockchain Events to Track
- Reservation created
- Payment submitted
- Payment verified
- QR issued
- Check-in confirmed
- Reservation cancelled
- Checkout/completion
Smart Contract Escrow Direction
Smart contract escrow is part of the framework and future production direction.
For MVP, escrow can be represented as a demo contract, event ledger, or hash-based proof system on Sepolia.
18. Supabase Direction

Supabase is the off-chain operational data source.

Supabase Stores
- users/profiles
- reservations
- units/rooms/amenities
- payment proofs
- guest services
- QR token metadata
- audit logs
- sync state where needed
- media files
Supabase Security Rules
- Use Row Level Security where appropriate.
- Never expose service role key to frontend.
- Use anon key only in frontend.
- Backend should handle trusted operations.
- Storage buckets should have controlled access.
19. FastAPI Direction

FastAPI should act as the trusted backend layer.

FastAPI Responsibilities
- QR token issuance
- QR token verification
- reservation validation
- payment verification support
- AI endpoints
- blockchain bridge operations
- secure service-role Supabase operations
- admin-only operations
FastAPI Should Protect
- signing secrets
- service role key
- blockchain private keys
- AI model internals
- privileged admin operations
20. Deployment Direction
Current Recommended Development Setup
Frontend:
- Local Next.js during development
- Vercel for deployment

Backend:
- Local FastAPI during development
- Deploy later to Railway, Render, Fly.io, or similar

Database:
- Supabase Cloud recommended for faster development
- Local Supabase/Docker optional for migration testing

Blockchain:
- Sepolia for current demo/development
- Polygon L2 later
Recommended Development Workflow
GitHub = code source of truth
Supabase migrations = database schema source of truth
Supabase Cloud = active development database
Local Supabase/Docker = optional migration/risky testing
Sepolia = active blockchain development/demo chain
21. Important Development Rules for Codex

Any AI/Codex work should follow these rules:

1. Read this PROJECT_ALIGNMENT.md first.
2. Do not change business rules unless explicitly requested.
3. Do not change auth/security/role logic unless explicitly requested.
4. Do not store guest PII on-chain.
5. Do not place service role keys in frontend code.
6. Do not break offline-first behavior.
7. Do not remove QR or sync workflows.
8. Do not rewrite backend contracts unnecessarily.
9. Prefer incremental changes.
10. Keep Sepolia as the current active blockchain chain.
11. Treat Polygon L2 as a future cutover target.
12. Preserve Supabase as the off-chain source of truth.
13. Preserve FastAPI as the trusted backend layer.
14. Keep UI mobile-first.
15. Run build/lint/tests where available before reporting completion.
22. Recommended Codex Startup Prompt

Use this when starting a new Codex session:

You are my senior full-stack developer for the Hillside Hidden Resort PWA.

Before making changes, read PROJECT_ALIGNMENT.md.

Important architecture direction:
- Frontend is Next.js 15 PWA.
- Backend is FastAPI.
- Supabase stores guest profiles, reservations, media, payment proofs, and operational data.
- Blockchain is used for immutable proof, ledger references, escrow concepts, and audit hashes.
- Current blockchain development/demo chain is Ethereum Sepolia.
- Polygon L2 is the future cutover target.
- Keep guest PII off-chain.
- QR check-in must use signed/dynamic QR concepts and offline-first behavior.
- AI uses Prophet/scikit-learn for pricing recommendation and occupancy forecasting.
- Do not change business rules, auth logic, payment/deposit logic, QR logic, or backend contracts unless explicitly requested.

Your first task:
1. Inspect the repo.
2. Identify frontend/backend/env/database/blockchain structure.
3. Confirm current run commands.
4. Confirm where QR, booking, payment, sync, and blockchain logic are implemented.
5. Do not modify code yet.
6. Report your findings and risks first.
23. Recommended Feature Build Order
Phase 1 — Stabilize Core App
- Supabase Cloud setup
- Auth/session stability
- Guest booking flow
- Admin reservation approval
- Payment proof upload
- Unit availability
- Responsive guest UI
Phase 2 — QR Check-In
- Dynamic QR token generation
- Admin scan console
- QR verification endpoint
- Check-in status update
- Offline cached QR display
- Offline admin scan queue
Phase 3 — Blockchain / Sepolia Demo
- Smart contract or event ledger on Sepolia
- Store booking/check-in/payment hash
- Show tx hash in admin ledger explorer
- Keep PII off-chain
- Document Polygon as future cutover
Phase 4 — AI Module
- Occupancy forecasting
- Demand trend
- Pricing recommendation
- Admin applies recommendations manually
Phase 5 — PWA / Offline Trust
- Offline-first guest map
- Cached booking/QR state
- Sync Center
- Queued actions
- Clear offline/sync UI
Phase 6 — Polish / Demo Readiness
- Guest mobile-first UI
- Admin dashboard polish
- E2E tests
- Security review
- Capstone documentation
- Defense demo script
24. What Not to Overbuild Yet

Avoid building these too early unless explicitly required:

1. NFT Guest Passes
2. Full ZKP
3. Production smart contract escrow with real funds
4. Automated AI price changes
5. Custodial wallet system
6. Complex crypto payment flow
7. Production Polygon mainnet deployment

These can create risk and delay the main capstone deliverable.

25. Final Project Positioning

The system should be positioned as:

A mobile-first, offline-capable resort PWA that combines QR-based guest check-in, reservation management, AI-assisted resort intelligence, and blockchain-backed auditability using Sepolia for development and Polygon L2 as a future deployment target.
26. One-Sentence Summary
Hillside Hidden Resort is a Next.js 15 PWA with FastAPI, Supabase, AI forecasting, QR-based offline-capable check-in, and Sepolia-based blockchain auditability, with Polygon L2 retained as the future smart contract deployment target.

After creating PROJECT_ALIGNMENT.md, read it and report:

Whether the repository structure matches the guide.
Which modules already exist.
Which modules are missing or incomplete.
Any risks before continuing development.
Recommended next implementation steps.
