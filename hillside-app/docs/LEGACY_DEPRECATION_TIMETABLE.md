# Legacy React Deprecation Timetable (Wave 5)

Last updated: 2026-02-21

## Scope

This timetable applies to `hillside-app` (React/Vite legacy runtime) after Next.js + V2 facade convergence.

## Milestones

1. **2026-02-21 to 2026-02-28 (Burn-in window)**
   - Keep `hillside-app` and `hillside-next` both runnable.
   - Default testing path: `hillside-next` + `hillside-api` facade-on.
   - Track critical regression classes:
     - reservations create/update/cancel
     - payments submit/verify/on-site
     - admin check-in/check-out + escrow reconciliation
     - reports and audit reads

2. **2026-03-01 (Freeze legacy write usage)**
   - Mark legacy write-path UI entry points as deprecated in docs/README.
   - Keep legacy app as rollback-only runtime.
   - No new feature work lands in `hillside-app`.

3. **2026-03-07 (Deprecation gate)**
   - If no Sev-1 regression in burn-in:
     - classify React app as maintenance-only.
     - update onboarding docs to point to `hillside-next` as default frontend.
   - If regressions exist:
     - extend burn-in by 7 days and re-evaluate.

4. **2026-03-14 (Retire legacy default)**
   - Remove legacy app from default local startup docs/scripts.
   - Keep codebase archived in repo for audit/history until final archival decision.

## Rollback Policy During Burn-In

1. Rollback trigger:
   - Sev-1 booking/payment/check-in regression in Next.js path.
2. Rollback action:
   - Temporarily route testers/operators to `hillside-app`.
   - Open hotfix issue against `hillside-next`/`hillside-api`.
3. Exit rollback:
   - Hotfix verified in staging/local + regression checklist re-run.

## Ownership

1. Frontend owner: Next.js route parity and UX blockers.
2. API owner: V2 facade correctness and auth/contract stability.
3. Data/chain owner: escrow reconciliation, monitor alerts, settlement integrity.
