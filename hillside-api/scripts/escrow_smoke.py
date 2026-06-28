"""On-chain escrow smoke test.

Locks then releases a throwaway probe booking on the active chain, proving the
real lock/release path works end to end (build tx -> sign -> send -> receipt ->
state read). Sends TWO real transactions on the configured chain (testnet =
negligible gas). Run after escrow_preflight passes.

Usage (from hillside-api, with .env in place + FEATURE_ESCROW_ONCHAIN_LOCK=true):
    .venv/Scripts/python scripts/escrow_smoke.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    from app.core.chains import get_active_chain
    from app.integrations.escrow_chain import (
        lock_reservation_escrow_onchain,
        read_escrow_record_onchain,
        release_reservation_escrow_onchain,
    )

    chain = get_active_chain()
    explorer = chain.explorer_base_url or "https://sepolia.etherscan.io/tx/"
    probe = "smoke-probe-" + os.urandom(5).hex()  # unique -> a fresh escrow record
    print(f"chain={chain.key}  probe={probe}\n")

    print("1) lock on-chain ...")
    lock = lock_reservation_escrow_onchain(chain=chain, reservation_id=probe)
    print(f"   LOCK tx:    {lock.tx_hash}")
    print(f"   explorer:   {explorer}{lock.tx_hash}")
    after_lock = read_escrow_record_onchain(chain=chain, reservation_id=probe)
    print(f"   state now:  {after_lock.state} (amount_wei={after_lock.amount_wei})\n")

    print("2) release on-chain ...")
    rel = release_reservation_escrow_onchain(
        chain=chain, reservation_id=probe, onchain_booking_id=lock.onchain_booking_id
    )
    print(f"   RELEASE tx: {rel.tx_hash}")
    print(f"   explorer:   {explorer}{rel.tx_hash}")
    after_release = read_escrow_record_onchain(chain=chain, reservation_id=probe)
    print(f"   state now:  {after_release.state}\n")

    ok = after_lock.state == "locked" and after_release.state == "released"
    if ok:
        print("SMOKE PASSED: lock -> released confirmed on-chain.")
        return 0
    print(f"SMOKE UNEXPECTED: {after_lock.state} -> {after_release.state}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
