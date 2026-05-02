# Guest UX Automation Guardrails

Last updated: 2026-05-02  
Status: Scaffolded (ready to run after dependency install)

## Goal

Add lightweight automated checks so guest UX quality is not dependent on manual validation alone.

## Scope (Initial)

1. Route smoke checks for high-traffic guest paths.
2. Basic accessibility scan checks (axe) on core booking pages.
3. Keep manual G5 evidence run as final sign-off artifact.

## Added Files

1. `hillside-next/playwright.guest.config.mjs`
2. `hillside-next/tests/guest-e2e/guest-smoke.spec.mjs`
3. `hillside-next/tests/guest-e2e/guest-a11y.spec.mjs`

## Added Scripts

1. Root:
   - `npm run test:guest:e2e`
2. Next app:
   - `npm --prefix hillside-next run test:e2e:guest`
   - `npm --prefix hillside-next run test:e2e:guest:headed`

## Dependencies

Added to `hillside-next/package.json`:

1. `@playwright/test`
2. `@axe-core/playwright`

## First-Time Setup

Run from repo root:

```powershell
npm install
npx --prefix hillside-next playwright install chromium
```

## Run Commands

Local (headless):

```powershell
npm run test:guest:e2e
```

Local (headed):

```powershell
npm --prefix hillside-next run test:e2e:guest:headed
```

Optional custom base URL:

```powershell
$env:GUEST_E2E_BASE_URL="http://127.0.0.1:3000"
npm run test:guest:e2e
```

## Latest Run (2026-05-02)

1. Command: `npm run test:guest:e2e`
2. Result: pass (`7 passed`)
3. Coverage now includes:
   - guest route smoke checks (`/book`, `/tours`, `/guest/map`, `/my-bookings`, `/guest/sync`)
   - guest accessibility smoke checks (axe on `/book`, `/tours`)

## Notes

1. Tests are intentionally smoke-level (fast and stable) and do not replace the full G5 manual scenario matrix.
2. Protected guest routes are validated with graceful expectations (either content view or auth/session gate), to support local environments with different auth states.
3. Manual evidence remains required for final closure docs:
   - `docs/re-architecture-core/evidence/guest-ux/manual-run-template.md`
   - `docs/re-architecture-core/evidence/guest-ux/g5-closure-summary-template.md`
