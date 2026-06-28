"""Phase 6 on-chain escrow preflight check.

Run this AFTER you deploy EscrowLedger.sol + set the Sepolia env vars, but
BEFORE flipping FEATURE_ESCROW_ONCHAIN_LOCK=true. It validates the whole on-chain
config against the live chain so you don't discover a misconfig only when a real
reservation tries to lock funds.

The single most important check: the backend signer MUST be the contract
`operator`, or release()/refund() revert with "operator only". This catches that.

Usage (from the hillside-api directory, with your .env in place):
    .venv/Scripts/python scripts/escrow_preflight.py        # Windows
    .venv/bin/python scripts/escrow_preflight.py            # macOS/Linux

Exit code 0 = safe to go live; non-zero = fix the [FAIL] items and re-run.
Reads everything from your .env — no secrets are printed.
"""

from __future__ import annotations

import os
import sys

# Allow running as a plain script: put the hillside-api root on the path so
# `from app...` resolves regardless of the current working directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    state = {"fail": 0, "warn": 0}

    def ok(msg: str) -> None:
        print(f"  [ OK ] {msg}")

    def fail(msg: str) -> None:
        state["fail"] += 1
        print(f"  [FAIL] {msg}")

    def warn(msg: str) -> None:
        state["warn"] += 1
        print(f"  [WARN] {msg}")

    print("On-chain escrow preflight\n")

    from app.core.chains import get_active_chain
    from app.core.config import settings

    # --- Feature flag ---
    if settings.feature_escrow_onchain_lock:
        ok("FEATURE_ESCROW_ONCHAIN_LOCK is ON")
    else:
        warn("FEATURE_ESCROW_ONCHAIN_LOCK is OFF - escrow stays in shadow mode until you flip it")

    chain = get_active_chain()
    print(f"  active chain: {chain.key} (configured chain_id={chain.chain_id})\n")

    # --- Static config presence ---
    if chain.rpc_url:
        ok("RPC URL is set")
    else:
        fail("RPC URL missing  (set EVM_RPC_URL_SEPOLIA)")
    if chain.escrow_contract_address:
        ok(f"contract address is set ({chain.escrow_contract_address})")
    else:
        fail("contract address missing  (set ESCROW_CONTRACT_ADDRESS_SEPOLIA)")
    if chain.signer_private_key:
        ok("signer private key is set")
    else:
        fail("signer private key missing  (set ESCROW_SIGNER_PRIVATE_KEY_SEPOLIA)")

    if state["fail"]:
        print(f"\nStopped: {state['fail']} missing config value(s). Set them in .env and re-run.")
        return 1

    # --- Live chain checks ---
    try:
        from eth_account import Account
        from web3 import Web3
    except Exception as exc:  # noqa: BLE001
        fail(f"web3 / eth_account not importable: {exc}")
        return 1

    try:
        w3 = Web3(
            Web3.HTTPProvider(
                chain.rpc_url, request_kwargs={"timeout": int(settings.escrow_rpc_timeout_sec)}
            )
        )
        connected = bool(w3.is_connected())
    except Exception as exc:  # noqa: BLE001
        fail(f"RPC connection error: {exc}")
        return 1
    if connected:
        ok("RPC is reachable")
    else:
        fail("RPC is not reachable — check EVM_RPC_URL_SEPOLIA")
        return 1

    try:
        live_chain_id = int(w3.eth.chain_id)
        if live_chain_id == int(chain.chain_id):
            ok(f"chain id matches ({live_chain_id})")
        else:
            fail(f"chain id mismatch: RPC reports {live_chain_id}, config expects {chain.chain_id}")
    except Exception as exc:  # noqa: BLE001
        warn(f"could not read chain id: {exc}")

    addr = Web3.to_checksum_address(chain.escrow_contract_address)
    try:
        code = w3.eth.get_code(addr)
        if code and len(code) > 0:
            ok("contract is deployed (bytecode present at the address)")
        else:
            fail("no bytecode at the contract address — not deployed on this chain?")
    except Exception as exc:  # noqa: BLE001
        fail(f"get_code failed: {exc}")

    try:
        signer_addr = Account.from_key(chain.signer_private_key).address
        ok(f"signer address resolves to {signer_addr}")
    except Exception as exc:  # noqa: BLE001
        fail(f"signer private key is invalid: {exc}")
        return 1

    # THE critical check: signer must equal the contract operator.
    operator_abi = [
        {
            "inputs": [],
            "name": "operator",
            "outputs": [{"name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function",
        }
    ]
    try:
        contract = w3.eth.contract(address=addr, abi=operator_abi)
        operator_addr = contract.functions.operator().call()
        if Web3.to_checksum_address(operator_addr) == Web3.to_checksum_address(signer_addr):
            ok("signer IS the contract operator -> release()/refund() will work")
        else:
            fail(
                "signer is NOT the contract operator -> release()/refund() will revert "
                f"('operator only'). operator={operator_addr}. "
                "Fix: deploy with the signer key, or call setOperator(signer) from the current operator."
            )
    except Exception as exc:  # noqa: BLE001
        fail(f"could not read operator() — wrong address or not an EscrowLedger? ({exc})")

    # Gas balance.
    try:
        bal_wei = int(w3.eth.get_balance(signer_addr))
        bal_eth = bal_wei / 1e18
        if bal_wei == 0:
            fail("signer has 0 ETH — fund it from a Sepolia faucet (it pays gas for lock/release/refund)")
        elif bal_eth < 0.02:
            warn(f"signer balance is low: {bal_eth:.4f} ETH — top up to avoid stalls")
        else:
            ok(f"signer is funded: {bal_eth:.4f} ETH")
    except Exception as exc:  # noqa: BLE001
        warn(f"could not read signer balance: {exc}")

    ok(f"ESCROW_LOCK_AMOUNT_WEI = {int(settings.escrow_lock_amount_wei)} wei (per-reservation lock)")

    # Read-path sanity: an escrows() view call through the real backend helper.
    try:
        from app.integrations.escrow_chain import read_escrow_record_onchain

        record = read_escrow_record_onchain(chain=chain, reservation_id="escrow-preflight-probe")
        ok(f"escrows() read works (probe state = '{record.state}')")
    except Exception as exc:  # noqa: BLE001
        warn(f"escrows() read probe failed (ABI/contract mismatch?): {exc}")

    print()
    if state["fail"]:
        print(
            f"PREFLIGHT FAILED: {state['fail']} blocker(s), {state['warn']} warning(s). "
            "Fix the [FAIL] items, then re-run."
        )
        return 1
    print(
        f"PREFLIGHT PASSED ({state['warn']} warning(s)). "
        "Safe to set FEATURE_ESCROW_ONCHAIN_LOCK=true and restart the API."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
