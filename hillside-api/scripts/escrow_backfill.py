"""Backfill a missed escrow lock for a single reservation.

If a booking was paid + confirmed while escrow was misconfigured (e.g. both
feature flags off, or the wrong gating), it can end up confirmed with
escrow_state='none' and no on-chain lock. This re-runs the exact escrow-apply
path used by the payment webhook for one reservation, so it locks on-chain
(when FEATURE_ESCROW_ONCHAIN_LOCK is on) and records the metadata.

Usage (from hillside-api, with .env in place):
    .venv/Scripts/python scripts/escrow_backfill.py HR-20260628-56F3
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: escrow_backfill.py <RESERVATION_CODE>")
        return 2
    code = sys.argv[1].strip()

    from app.api.v2.routes.reservations import _maybe_apply_escrow_shadow_write
    from app.integrations.supabase_client import get_reservation_by_code

    row = get_reservation_by_code(code)
    if not row:
        print(f"reservation not found: {code}")
        return 1

    rid = str(row.get("reservation_id") or "")
    status = str(row.get("status") or "")
    paid = float(row.get("amount_paid_verified") or 0)
    state = str(row.get("escrow_state") or "none")
    print(f"{code}: status={status} paid={paid} escrow_state={state}")

    if status not in {"confirmed", "checked_in"}:
        print("  skip: not paid/confirmed yet (escrow only applies after the deposit is verified).")
        return 1
    if state not in {"none", "failed"}:
        print(f"  skip: escrow already applied (state={state}).")
        return 0

    print("  applying escrow ...")
    ref = _maybe_apply_escrow_shadow_write(rid)
    if ref is None:
        print("  RESULT: skipped (both escrow feature flags off, or chain not configured).")
        return 1
    print(f"  RESULT: state={ref.state}  tx={ref.tx_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
