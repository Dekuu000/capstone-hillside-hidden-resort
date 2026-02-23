# Re-Architecture Core - Overview

This folder defines the target Web3-hybrid architecture and the migration baseline while legacy apps continue running.

## Active runtimes

- `hillside-app/`: legacy React + Vite production flow (kept live).
- `hillside-next/`: new Next.js 15 UI shell (guest/admin migration target).
- `hillside-api/`: FastAPI domain layer for `/v2/*`.
- `hillside-contracts/`: Solidity contracts (Sepolia active in development, Polygon Amoy retained as target/cutover network).
- `supabase/`: root migrations and edge functions (shared data plane).

## Migration rule

- Use phased strangler: wire new vertical slices to V2 endpoints while preserving legacy fallback.

## Immediate objectives

- Keep business continuity.
- Centralize shared contracts/types.
- Move Supabase assets to root for all runtimes.
