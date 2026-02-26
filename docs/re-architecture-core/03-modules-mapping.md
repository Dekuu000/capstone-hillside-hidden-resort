# Modules Mapping

## Guide module to runtime mapping

| Module | Current Owner | V2 Owner |
|---|---|---|
| Reservation lifecycle | Supabase RPC + React services | FastAPI reservations + Next.js |
| Payment verification | Supabase + legacy admin UI | FastAPI payments + Next.js admin |
| QR check-in | Legacy UI + Supabase flows | FastAPI QR service + Next.js |
| Blockchain anchoring/ledger | Supabase edge function (anchor demo) | Solidity + FastAPI ethers bridge |
| AI recommendations | Rule-based analytics | FastAPI -> AI inference service |

## Shared package ownership

- `packages/shared/src/types.ts`: shared domain types for all TS runtimes.
- `packages/shared/src/schemas.ts`: zod schemas for request/event payload validation.
