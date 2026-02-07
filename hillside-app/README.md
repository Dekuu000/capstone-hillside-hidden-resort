# 🏨 Hillside Hidden Resort - Reservation System

A blockchain-enabled PWA for guest check-in and reservation management with QR-based workflows, built for Hillside Hidden Resort.

## 🚀 Features

- **Smart Booking**: Real-time availability checking with atomic overlap prevention
- **QR Check-in**: Contactless check-in and checkout via admin QR scanning
- **Payment Workflows**: Deposit/full payment options with admin verification
- **Blockchain Audit**: Immutable audit trail on Sepolia/Mumbai testnet
- **AI Assistance**: Risk scoring for duplicate bookings, peak day analytics, and automated report summaries
- **PWA**: Installable progressive web app with offline support

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS (design system: navy #1E3A8A + orange #F97316)
- **Backend**: Supabase (PostgreSQL + Auth + RLS + Storage)
- **Blockchain**: Hardhat + Solidity + ethers.js (Sepolia testnet)
- **PWA**: vite-plugin-pwa + Workbox
- **State Management**: TanStack React Query
- **Forms**: React Hook Form + Zod validation
- **QR**: qrcode.react + html5-qrcode
- **UI**: Lucide React icons

## 📁 Project Structure

```
hillside-app/
├── src/
│   ├── components/
│   │   ├── ui/              # Base components (Button, Input, Card)
│   │   ├── forms/           # Form components with validation
│   │   ├── layout/          # Layout components (Sidebar, Header)
│   │   └── data-display/    # Tables, Lists, Charts
│   ├── features/
│   │   ├── auth/            # Authentication
│   │   ├── units/           # Unit management
│   │   ├── reservations/    # Booking workflows
│   │   ├── payments/        # Payment verification
│   │   ├── checkin/         # QR check-in/out
│   │   ├── reports/         # Analytics & reports
│   │   └── blockchain/      # Audit trail
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities, Supabase client
│   ├── pages/               # Route pages
│   ├── types/               # TypeScript definitions
│   └── styles/              # Global CSS
├── supabase/
│   ├── migrations/          # SQL migrations
│   └── functions/           # Edge functions
└── contracts/               # Solidity smart contracts
```

## 🎨 Design System

**Color Palette**:
- Primary: `#1E3A8A` (Navy blue)
- Secondary: `#3B82F6` (Sky blue)
- CTA: `#F97316` (Booking orange)
- Background: `#EFF6FF` (Light blue)
- Text: `#1E40AF`

**Typography**: Inter (Google Fonts)

**Style**: Data-Dense Dashboard with Liquid Glass effects for guest booking flow

See [design-system/hillside-hidden-resort/MASTER.md](../.agent/design-system/hillside-hidden-resort/MASTER.md) for complete guidelines.

## 🔧 Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Supabase account
- Infura/Alchemy account (for testnet RPC)

### Installation

1. **Clone and install dependencies**:
   ```bash
   cd hillside-app
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   
   Navigate to: `http://localhost:5173`

## 📋 Development Phases

- [x] **Phase 0**: Project setup, design system, Tailwind config ✅
- [x] **Phase 1**: Auth + roles + RLS + layouts ✅
- [x] **Phase 2**: Units management (admin CRUD) ✅
- [ ] **Phase 3**: Reservations + availability engine ⬅️ *Current*
- [ ] **Phase 4**: Payments + proof upload + verification
- [ ] **Phase 5**: QR check-in/checkout
- [ ] **Phase 6**: Reports + CSV export + AI summaries
- [ ] **Phase 7**: Blockchain audit trail
- [ ] **Phase 8**: AI risk scoring + analytics
- [ ] **Phase 9**: Production hardening + deployment

## 🗄️ Database Schema (ERD)

Tables: `users`, `units`, `reservations`, `reservation_units`, `payments`, `checkin_logs`, `audit_logs`

See [implementation_plan.md](../../.gemini/antigravity/brain/0e76eebf-8ce6-46af-8bfd-959317307016/implementation_plan.md) for complete schema and migrations.

## 📖 Documentation

- [Implementation Plan](../../.gemini/antigravity/brain/0e76eebf-8ce6-46af-8bfd-959317307016/implementation_plan.md) - Complete phase-by-phase guide
- [Task Tracking](../../.gemini/antigravity/brain/0e76eebf-8ce6-46af-8bfd-959317307016/task.md) - Development checklist
- [Design System MASTER](../.agent/design-system/hillside-hidden-resort/MASTER.md) - UI/UX guidelines

## 🤝 Contributing

This is a capstone project. Team roles:
- **Backend Dev**: Database schema, RLS policies, Edge functions
- **Frontend Dev**: UI components, forms, PWA
- **Blockchain Dev**: Smart contract, audit integration
- **QA/Docs**: Testing, documentation, deployment

## 📄 License

Academic/Educational Project - Hillside Hidden Resort

---

**Status**: Phase 2 Complete ✓ | Current: Phase 3 (Reservations + Availability Engine)
