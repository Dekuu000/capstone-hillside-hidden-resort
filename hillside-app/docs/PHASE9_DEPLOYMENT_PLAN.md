# Phase 9 Plan - Production Hardening + Deployment

Last updated: 2026-02-13

## Goal
Ship a stable, secure, production-ready release with reliable deployment, monitoring, backups, and rollback.

## Scope (Phase 9)
1. Environment hardening (Supabase + Edge Functions + secrets)
2. Security review (RLS, auth, role checks, rate limits)
3. Performance + reliability (bundle size, caching, retries)
4. Monitoring + alerting (logs, errors, uptime)
5. Deployment + rollback runbook
6. Final regression + sign-off

## Non-Goals
- New features
- Schema redesign
- UI redesign

---

## Phase 9 Step-by-Step

### Step 0 - Production Checklist (Prereqs)
- Confirm production project in Supabase is created
- Confirm domains and HTTPS (if custom domain)
- Confirm all secrets are stored in Supabase and not in repo

### Step 1 - Environment and Secrets
Supabase:
- Verify production URLs and keys
- Rotate service role key if needed
- Confirm Edge Function secrets are set:
  - `SEPOLIA_RPC_URL`
  - `ANCHOR_PRIVATE_KEY`
  - `CHAIN_ID`
  - `ANCHOR_SUPABASE_URL`
  - `ANCHOR_SERVICE_ROLE_KEY`

Client env:
- `.env` includes only `VITE_*` keys
- No private keys or service role keys in `.env`

### Step 2 - Auth and RLS Hardening
- RLS enabled on all sensitive tables
- Admin-only RPCs enforce `public.is_admin()`
- Verify auth flows for admin and guest
- Re-enable "Verify JWT" for Edge Functions if stable

### Step 3 - Edge Function Stability
- Confirm `anchor-audit` works with Verify JWT on
- Add simple rate limit logic (already in code or documented)
- Confirm CORS policy is strict enough for production origin

### Step 4 - Performance and Build Size
- Address build warning for large chunks
  - Code split AdminScanPage or large modules
- Confirm lazy loading for admin-only pages
- Validate PWA service worker and caching strategy

### Step 5 - Observability
- Enable Supabase logs (Edge Functions + database)
- Add error logging in UI (optional Sentry or console-only)
- Define critical alerts:
  - Auth failures
  - Edge Function failures
  - Payment verification errors

### Step 6 - Backups and Recovery
- Configure automated DB backups in Supabase
- Document restore steps
- Confirm Storage backup policy for payment proofs

### Step 7 - Deployment Runbook
- Tag release in Git
- Deploy client (Vite build) to hosting target
- Verify production URLs
- Smoke test (admin + guest)

### Step 8 - Rollback Plan
- Last known good tag + deployment
- DB migrations are forward-only; rollback by hotfix migration
- Edge Function rollback: re-deploy prior version

---

## Final Regression Checklist (Phase 9)
Admin:
- Login, dashboard, payments, audit, reports, scan
- Anchor now + Confirm status + Verify DB
- Reports CSV exports

Guest:
- Booking flows (unit + tour)
- Payment proof upload
- QR access rules

System:
- `npm run build` passes
- No console errors on core pages
- RLS checks working (no access from non-admin)

---

## Acceptance Criteria
- Production deployment stable and documented
- Secrets managed securely
- Rollback plan documented and tested
- Final regression passed

