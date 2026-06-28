"""One-shot diagnostic: why didn't a paid booking lock escrow?

Prints the effective feature flags + active-chain config (no secrets), then the
most recent confirmed/checked-in reservations with their escrow_state so we can
see which paid bookings never locked.

Usage (from hillside-api, with .env in place):
    .venv/Scripts/python scripts/escrow_diag.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    from app.core.chains import get_active_chain
    from app.core.config import settings
    from app.integrations.supabase_client import get_supabase_client

    print("=== Feature flags (effective in THIS process) ===")
    print(f"  FEATURE_ESCROW_ONCHAIN_LOCK = {settings.feature_escrow_onchain_lock}")
    print(f"  FEATURE_ESCROW_SHADOW_WRITE = {settings.feature_escrow_shadow_write}")
    print(f"  FEATURE_NFT_GUEST_PASS      = {getattr(settings, 'feature_nft_guest_pass', None)}")

    chain = get_active_chain()
    print("\n=== Active chain ===")
    print(f"  key             = {chain.key}")
    print(f"  enabled         = {chain.enabled}")
    print(f"  chain_id        = {chain.chain_id}")
    print(f"  rpc_url set     = {bool(chain.rpc_url)}")
    print(f"  contract set    = {bool(chain.escrow_contract_address)}")
    print(f"  signer key set  = {bool(chain.signer_private_key)}")

    print("\n=== Recent confirmed/checked-in reservations ===")
    sb = get_supabase_client()
    resp = (
        sb.table("reservations")
        .select(
            "reservation_code,reservation_id,status,"
            "amount_paid_verified,escrow_state,chain_tx_hash,created_at,updated_at"
        )
        .in_("status", ["confirmed", "checked_in", "checked_out"])
        .order("created_at", desc=True)
        .limit(15)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        print("  (none)")
    for r in rows:
        print(
            f"  {r.get('reservation_code'):<20} "
            f"type={str(r.get('reservation_type')):<8} "
            f"status={str(r.get('status')):<11} "
            f"paid={str(r.get('amount_paid_verified')):<7} "
            f"escrow={str(r.get('escrow_state') or 'none'):<12} "
            f"tx={'yes' if r.get('chain_tx_hash') else '-'}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
