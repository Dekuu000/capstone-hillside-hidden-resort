# Release Admin Checklist

Last updated: 2026-02-25

## 1) GitHub Branch Protection (manual)

Apply to branch: `master`

1. Go to `Settings` -> `Branches` -> `Add branch protection rule`.
2. Branch name pattern: `master`.
3. Enable `Require a pull request before merging`.
4. Enable `Require status checks to pass before merging`.
5. Add required checks:
   - `web-validate`
   - `api-validate (3.11)`
   - `api-validate (3.12)`
   - `release-gate-core`
   - `release-gate-sepolia-smoke`
6. Enable `Require branches to be up to date before merging`.
7. Enable `Restrict who can push to matching branches` (if available).
8. Disable force pushes and deletions for `master`.

## 2) Secrets Rotation (manual)

Minimum high-risk secrets to rotate immediately if exposed:

1. `SEPOLIA_ESCROW_SIGNER_PRIVATE_KEY`
2. `SUPABASE_SERVICE_ROLE_KEY` (if exposed)
3. `SEPOLIA_QR_SIGNING_SECRET`
4. `SUPABASE_DB_URL` password component

After rotation:

1. Update GitHub Actions secrets.
2. Update local `.env` files (never commit).
3. Re-run `CI` workflow.

## 3) Release Candidate Gate

1. Ensure latest `master` run is green for all required checks.
2. Create tag:
```bash
git tag -a v0.9.0-rc1 -m "Sepolia release-gate baseline (all green)"
git push origin v0.9.0-rc1
```
3. Execute manual demo flow from `docs/re-architecture-core/07-demo-testplan.md`.

