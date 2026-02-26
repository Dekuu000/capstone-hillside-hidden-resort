# Hillside Hidden Resort - Monorepo

Web3-hybrid capstone workspace with legacy runtime + V2 migration runtimes running in parallel.

## Runtimes

- `hillside-app/` - legacy production app (`React + Vite + Supabase`), kept operational.
- `hillside-next/` - Next.js 15 migration app (Tailwind, SSR shell).
- `hillside-api/` - FastAPI V2 domain API.
- `hillside-contracts/` - Solidity/Hardhat workspace (Polygon Amoy target).
- `supabase/` - **root shared data plane** (`migrations/` + `functions/`).
- `packages/shared/` - reusable TS types/schemas for cross-app contracts.

## Root scripts

```bash
npm install
npm run dev:react
npm run dev:next
npm run dev:api
npm run dev:contracts
npm run lint
npm run typecheck
npm run test
```

## Migration strategy

Phased strangler:

1. Keep legacy app as fallback.
2. Move feature vertical slices to `hillside-next + hillside-api`.
3. Add contract and AI integrations behind feature flags.
4. Cut over after reconciliation and regression sign-off.

## Architecture docs

- `docs/re-architecture-core/01-overview.md`
- `docs/re-architecture-core/02-architecture.md`
- `docs/re-architecture-core/03-modules-mapping.md`
- `docs/re-architecture-core/04-database.md`
- `docs/re-architecture-core/05-api.md`
- `docs/re-architecture-core/06-security-privacy.md`
- `docs/re-architecture-core/07-demo-testplan.md`

Detailed V2 docs already tracked in legacy docs set:

- `hillside-app/docs/SYSTEM_ARCHITECTURE_V2.md`
- `hillside-app/docs/MIGRATION_ROADMAP.md`
- `hillside-app/docs/API_SURFACE_V2.md`
