from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.chains import get_active_chain, get_chain_registry
from app.integrations.escrow_chain import release_reservation_escrow_onchain
from app.integrations.supabase_client import (
    list_pending_release_reservations,
    write_reservation_escrow_shadow_metadata,
)


def _safe_int(raw: object, default: int = 0) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def retry_release_for_reservation_row(reservation_row: dict[str, Any]) -> dict[str, Any]:
    reservation_id = str(reservation_row.get("reservation_id") or "").strip()
    if not reservation_id:
        return {
            "ok": False,
            "reservation_id": "",
            "escrow_state": "skipped",
            "tx_hash": None,
            "message": "Missing reservation_id.",
        }

    escrow_state = str(reservation_row.get("escrow_state") or "").strip().lower()
    if escrow_state not in {"pending_release", "locked"}:
        return {
            "ok": False,
            "reservation_id": reservation_id,
            "escrow_state": "skipped",
            "tx_hash": str(reservation_row.get("chain_tx_hash") or "").strip() or None,
            "message": f"Reservation escrow state is '{escrow_state or 'none'}'.",
        }

    chain_key = str(reservation_row.get("chain_key") or get_active_chain().key).strip().lower()
    chain = get_chain_registry().get(chain_key, get_active_chain())
    if (
        not chain.enabled
        or not chain.rpc_url
        or not chain.escrow_contract_address
        or not chain.signer_private_key
    ):
        return {
            "ok": False,
            "reservation_id": reservation_id,
            "escrow_state": "pending_release",
            "tx_hash": str(reservation_row.get("chain_tx_hash") or "").strip() or None,
            "message": f"Chain '{chain.key}' is not fully configured.",
        }

    attempts = _safe_int(reservation_row.get("escrow_release_attempts"), default=0) + 1
    attempt_at = datetime.now(timezone.utc).isoformat()
    prior_tx_hash = str(reservation_row.get("chain_tx_hash") or "").strip() or f"shadow-release-{reservation_id}"
    prior_booking_id = str(reservation_row.get("onchain_booking_id") or "").strip() or None
    prior_event_index = _safe_int(reservation_row.get("escrow_event_index"), default=0)

    try:
        settlement = release_reservation_escrow_onchain(
            chain=chain,
            reservation_id=reservation_id,
            onchain_booking_id=reservation_row.get("onchain_booking_id"),
        )
        write_reservation_escrow_shadow_metadata(
            reservation_id=reservation_id,
            chain_key=chain.key,
            chain_id=chain.chain_id,
            contract_address=chain.escrow_contract_address,
            tx_hash=settlement.tx_hash,
            onchain_booking_id=settlement.onchain_booking_id,
            escrow_event_index=settlement.event_index,
            escrow_state="released",
            escrow_release_attempts=attempts,
            escrow_release_last_attempt_at=attempt_at,
            clear_escrow_release_last_error=True,
        )
        return {
            "ok": True,
            "reservation_id": reservation_id,
            "escrow_state": "released",
            "tx_hash": settlement.tx_hash,
            "message": "Escrow released on-chain.",
        }
    except Exception as exc:  # noqa: BLE001
        try:
            write_reservation_escrow_shadow_metadata(
                reservation_id=reservation_id,
                chain_key=chain.key,
                chain_id=chain.chain_id,
                contract_address=chain.escrow_contract_address,
                tx_hash=prior_tx_hash,
                onchain_booking_id=prior_booking_id,
                escrow_event_index=prior_event_index,
                escrow_state="pending_release",
                escrow_release_attempts=attempts,
                escrow_release_last_attempt_at=attempt_at,
                escrow_release_last_error=(str(exc).strip() or "Unknown release error.")[:500],
            )
        except Exception:  # noqa: BLE001
            pass
        return {
            "ok": False,
            "reservation_id": reservation_id,
            "escrow_state": "pending_release",
            "tx_hash": str(reservation_row.get("chain_tx_hash") or "").strip() or None,
            "message": str(exc),
        }


def retry_pending_release_batch(
    *,
    chain_key: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    resolved_chain = (chain_key or get_active_chain().key).strip().lower()
    rows = list_pending_release_reservations(chain_key=resolved_chain, limit=max(1, limit))
    return [retry_release_for_reservation_row(row) for row in rows]
