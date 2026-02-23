import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import AuthContext, require_admin
from app.core.chains import get_active_chain, get_chain_registry
from app.core.config import settings
from app.integrations.escrow_chain import release_reservation_escrow_onchain
from app.integrations.supabase_client import (
    perform_checkin as perform_checkin_rpc,
    perform_checkout as perform_checkout_rpc,
    get_reservation_by_id,
    write_reservation_escrow_shadow_metadata,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class CheckOperationRequest(BaseModel):
    reservation_id: str
    scanner_id: str | None = None
    override_reason: str | None = None


def _maybe_release_escrow_on_checkin(reservation_row: dict) -> None:
    if not settings.feature_escrow_onchain_lock:
        return

    reservation_id = str(reservation_row.get("reservation_id") or "")
    if not reservation_id:
        return

    escrow_state = str(reservation_row.get("escrow_state") or "none").lower()
    if escrow_state != "locked":
        logger.info(
            "Escrow release skipped: reservation not locked (reservation_id=%s, escrow_state=%s)",
            reservation_id,
            escrow_state,
        )
        return

    registry = get_chain_registry()
    chain_key = str(reservation_row.get("chain_key") or get_active_chain().key).lower()
    chain = registry.get(chain_key, get_active_chain())

    if (
        not chain.enabled
        or not chain.rpc_url
        or not chain.escrow_contract_address
        or not chain.signer_private_key
    ):
        logger.warning(
            "Escrow release skipped: chain not fully configured (reservation_id=%s, chain=%s)",
            reservation_id,
            chain.key,
        )
        return

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
        )
        logger.info(
            "Escrow release applied (reservation_id=%s, chain=%s, tx_hash=%s)",
            reservation_id,
            chain.key,
            settlement.tx_hash,
        )
    except RuntimeError:
        # Do not block check-in while chain settlement is under staged rollout.
        logger.exception(
            "Escrow release failed (reservation_id=%s, chain=%s)",
            reservation_id,
            chain.key,
        )


@router.get("/chains")
def get_chain_configuration(
    _: AuthContext = Depends(require_admin),
):
    active_chain = get_active_chain()
    registry = get_chain_registry()
    return {
        "active_chain": {
            "key": active_chain.key,
            "chain_id": active_chain.chain_id,
            "explorer_base_url": active_chain.explorer_base_url,
            "rpc_configured": bool(active_chain.rpc_url),
            "contract_configured": bool(active_chain.escrow_contract_address),
        },
        "chains": {
            key: {
                "chain_id": chain.chain_id,
                "enabled": chain.enabled,
                "explorer_base_url": chain.explorer_base_url,
                "rpc_configured": bool(chain.rpc_url),
                "contract_configured": bool(chain.escrow_contract_address),
            }
            for key, chain in registry.items()
        },
    }


@router.post("/checkins")
def perform_checkin(
    payload: CheckOperationRequest,
    auth: AuthContext = Depends(require_admin),
):
    try:
        row = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    try:
        perform_checkin_rpc(
            access_token=auth.access_token,
            reservation_id=payload.reservation_id,
            override_reason=payload.override_reason,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    _maybe_release_escrow_on_checkin(row)

    return {
        "ok": True,
        "reservation_id": payload.reservation_id,
        "status": "checked_in",
        "scanner_id": payload.scanner_id,
    }


@router.post("/checkouts")
def perform_checkout(
    payload: CheckOperationRequest,
    auth: AuthContext = Depends(require_admin),
):
    try:
        row = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    try:
        perform_checkout_rpc(access_token=auth.access_token, reservation_id=payload.reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return {
        "ok": True,
        "reservation_id": payload.reservation_id,
        "status": "checked_out",
        "scanner_id": payload.scanner_id,
    }
