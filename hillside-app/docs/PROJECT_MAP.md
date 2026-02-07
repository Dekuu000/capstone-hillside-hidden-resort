# Project Map — Hillside Hidden Resort Capstone

## Goal
PWA reservation + payments + QR check-in/out + reports + audit logs (blockchain-ready).

## Tech Stack
React + TS + Vite + Tailwind, Supabase (Postgres/Auth/Storage), PWA plugin, QR scan libs.

## Folder Overview
- src/
  - lib/        (supabase client, helpers)
  - features/   (domain modules: units, reservations, payments, checkin, reports, audit)
  - components/ (shared UI)
  - pages/routes/ (routing entry)
  - styles/

## Current Phase
Phase 3 complete: reservations + availability engine + overlap prevention.

## Business Rules (Non-negotiables)
- Overlap: new_in < existing_out AND new_out > existing_in
- Confirmed if SUM(verified payments) >= deposit_required OR total_amount
- No PII on blockchain; only hashes in audit_logs

## Key Files to Read First
- Supabase client: src/lib/supabase.ts
- Auth / role guard: src/components/ProtectedRoute.tsx
- Availability/overlap logic: src/features/reservations/useReservations.ts
- Reservations feature: src/features/reservations
- Routing entry: src/App.tsx
- UI layout components: src/components/layout/

## Commands
- npm install
- npm run dev
- npm run build

## File Tree
```
C:\Users\user\Desktop\Capstone PWA(BeraChain)\hillside-app
├── docs
|  └── PROJECT_MAP.md
├── eslint.config.js
├── index.html
├── MIGRATION_GUIDE.md
├── package-lock.json
├── package.json
├── PHASE3_MIGRATION_GUIDE.md
├── postcss.config.js
├── public
|  └── vite.svg
├── QUICK_START_MIGRATIONS.md
├── README.md
├── src
|  ├── App.css
|  ├── App.tsx
|  ├── assets
|  |  └── react.svg
|  ├── components
|  |  ├── layout
|  |  |  ├── AdminLayout.tsx
|  |  |  └── GuestLayout.tsx
|  |  └── ProtectedRoute.tsx
|  ├── features
|  |  ├── auth
|  |  |  └── schemas.ts
|  |  ├── reservations
|  |  |  └── useReservations.ts
|  |  └── units
|  |     ├── schemas.ts
|  |     └── useUnits.ts
|  ├── hooks
|  |  └── useAuth.ts
|  ├── index.css
|  ├── lib
|  |  ├── errors.ts
|  |  ├── supabase.ts
|  |  └── validation.ts
|  ├── main.tsx
|  ├── pages
|  |  ├── AdminDashboard.tsx
|  |  ├── GuestBookingPage.tsx
|  |  ├── GuestDashboard.tsx
|  |  ├── LoginPage.tsx
|  |  ├── MyBookingsPage.tsx
|  |  ├── NewReservationPage.tsx
|  |  ├── RegisterPage.tsx
|  |  ├── ReservationsPage.tsx
|  |  ├── UnitFormPage.tsx
|  |  └── UnitsPage.tsx
|  └── types
|     └── database.ts
├── supabase
|  └── migrations
|     ├── 20260205_001_create_users_table.sql
|     ├── 20260205_002_create_units_table.sql
|     ├── 20260205_003_create_reservations_table.sql
|     ├── 20260207_004_atomic_reservation.sql
|     ├── 20260207_005_enhanced_rls.sql
|     ├── 20260207_006_audit_logs.sql
|     └── 20260207_007_fix_duplicate_units.sql
├── tailwind.config.js
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```
