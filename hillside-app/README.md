# Hillside Hidden Resort - Reservation System

A blockchain-enabled PWA for guest check-in and reservation management with QR-based workflows, built for Hillside Hidden Resort.

## Features
- Smart Booking: Real-time availability checking with atomic overlap prevention
- Ticketed Tours: Day/Night tours priced by adults/kids with service bookings
- Payment Workflows: Flexible deposit/full payments, proof upload, admin verification, on-site payments
- Guest Self-Service: View bookings, submit proof, cancel eligible reservations
- PWA: Installable progressive web app
- QR check-in/out (Phase 5 complete)
  - Admin scan + validation + override check-in
  - Guest QR locked until confirmed/paid
- Reports + CSV export (Phase 6 complete)
- Audit trail + anchoring (Phase 7 complete, demo mode)
- Analytics dashboard + rule-based insights (Phase 8 complete)

## Tech Stack
- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS (design system: navy #1E3A8A + orange #F97316)
- Backend: Supabase (PostgreSQL + Auth + RLS + Storage + Edge Functions)
- Blockchain (Phase 7): Ethereum Sepolia anchoring via Supabase Edge Function (Deno) + ethers.js
  - RPC provider: Alchemy/Infura
  - Wallet: server-held key (can be generated from a MetaMask account)
- PWA: vite-plugin-pwa + Workbox
- State Management: TanStack React Query
- Forms: React Hook Form + Zod validation
- QR: qrcode.react + html5-qrcode
- UI: Lucide React icons

## Project Structure
```
hillside-app/
  src/
    components/
      ui/              # Base components (Button, Input, Card)
      forms/           # Form components with validation
      layout/          # Layout components (Sidebar, Header)
      data-display/    # Tables, Lists, Charts
    features/
      auth/            # Authentication
      units/           # Unit management
      reservations/    # Booking workflows
      payments/        # Payment verification
      services/        # Ticketed tour services
    hooks/             # Custom React hooks
    lib/               # Utilities, Supabase client
    pages/             # Route pages
    types/             # TypeScript definitions
    styles/            # Global CSS
  supabase/
    migrations/        # SQL migrations
    functions/         # Edge functions
  contracts/           # Solidity smart contracts
```

## Design System
Color Palette:
- Primary: `#1E3A8A` (Navy blue)
- Secondary: `#3B82F6` (Sky blue)
- CTA: `#F97316` (Booking orange)
- Background: `#EFF6FF` (Light blue)
- Text: `#1E40AF`

Typography: Inter (Google Fonts)

Style: Data-dense dashboard with liquid glass effects for guest booking flow

See `../.agent/design-system/hillside-hidden-resort/MASTER.md` for complete guidelines.

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Supabase account
- Alchemy or Infura account (Sepolia RPC)
- Sepolia wallet private key (server-held for anchoring)

### Installation
1. Clone and install dependencies:
   ```bash
   cd hillside-app
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

   Update `.env` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

   Navigate to: `http://localhost:5173`

## Blockchain Anchoring Setup (Phase 7)
Edge Function: `anchor-audit`

Set these **Edge Function secrets** in Supabase (do not store in `.env`):
- `SEPOLIA_RPC_URL`
- `ANCHOR_PRIVATE_KEY`
- `CHAIN_ID` (11155111)
- `ANCHOR_SUPABASE_URL`
- `ANCHOR_SERVICE_ROLE_KEY`
- `ANCHOR_ALLOWED_ORIGINS` (optional, comma-separated allowlist for CORS)

Notes:
- These values are used only by the Edge Function.
- Do not paste private keys in repo files.

## Development Phases
- [x] Phase 0: Project setup, design system, Tailwind config
- [x] Phase 1: Auth + roles + RLS + layouts
- [x] Phase 2: Units management (admin CRUD)
- [x] Phase 3: Reservations + availability engine
- [x] Phase 4: Payments + tours + proof upload + verification
- [x] Phase 5: QR check-in/checkout
- [x] Phase 6: Reports + CSV export + AI summaries (rule-based)
- [x] Phase 7: Blockchain audit anchoring (Sepolia, demo mode)
- [x] Phase 8: Analytics + AI insights
- [ ] Phase 9: Production hardening + deployment

## Database Schema (ERD)
Tables: `users`, `units`, `reservations`, `reservation_units`, `services`, `service_bookings`, `payments`, `checkin_logs`, `audit_logs`

See `../../.gemini/antigravity/brain/0e76eebf-8ce6-46af-8bfd-959317307016/implementation_plan.md` for complete schema and migrations.

## Documentation
- `../../.gemini/antigravity/brain/0e76eebf-8ce6-46af-8bfd-959317307016/implementation_plan.md` - Complete phase-by-phase guide
- `../../.gemini/antigravity/brain/0e76eebf-8ce6-46af-8bfd-959317307016/task.md` - Development checklist
- `../.agent/design-system/hillside-hidden-resort/MASTER.md` - UI/UX guidelines
- `docs/PROJECT_STATUS.md` - Current phase, decisions, and next steps
- `docs/ADMIN_PAYMENT_VERIFICATION.md` - Admin payment verification steps
- `docs/ANCHORING_EXPLAINER.md` - Plain-language anchoring explanation
- `docs/ANCHORING_SPEC.md` - Technical anchoring rules
- `docs/PHASE8_ANALYTICS_PLAN.md` - Phase 8 analytics + AI plan
- `docs/TEST_CHECKLIST.md` - Quick validation checklist after changes

## Contributing
This is a capstone project. Team roles:
- Backend Dev: Database schema, RLS policies, Edge functions
- Frontend Dev: UI components, forms, PWA
- Blockchain Dev: Smart contract, audit integration
- QA/Docs: Testing, documentation, deployment

## License
Academic/Educational Project - Hillside Hidden Resort

---

Status: Phase 7 Complete (Demo Mode) | Phase 8 Complete (Analytics + AI)
