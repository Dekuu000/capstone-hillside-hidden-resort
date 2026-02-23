from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import AuthContext, ensure_reservation_access, require_authenticated
from app.core.chains import get_active_chain, get_chain_registry
from app.integrations.guest_pass_chain import verify_guest_pass_onchain
from app.integrations.supabase_client import get_reservation_by_id

router = APIRouter()


class GuestPassVerificationResponse(BaseModel):
    reservation_id: str
    minted: bool
    chain_key: str | None = None
    contract_address: str | None = None
    token_id: int | None = None
    tx_hash: str | None = None
    reservation_hash: str | None = None
    owner: str | None = None
    onchain_valid: bool = False
    verify_error: str | None = None


@router.get("/guest-pass/{reservation_id}", response_model=GuestPassVerificationResponse)
def verify_guest_pass(
    reservation_id: str,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        reservation = get_reservation_by_id(reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    ensure_reservation_access(auth, reservation)

    token_id_raw = reservation.get("guest_pass_token_id")
    tx_hash = reservation.get("guest_pass_tx_hash")
    chain_key = str(reservation.get("guest_pass_chain_key") or "").strip().lower() or None
    reservation_hash = reservation.get("guest_pass_reservation_hash")
    minted = bool(token_id_raw and tx_hash and chain_key)

    response = GuestPassVerificationResponse(
        reservation_id=reservation_id,
        minted=minted,
        chain_key=chain_key,
        token_id=int(token_id_raw) if token_id_raw is not None else None,
        tx_hash=str(tx_hash) if tx_hash else None,
        reservation_hash=str(reservation_hash) if reservation_hash else None,
    )
    if not minted:
        return response

    registry = get_chain_registry()
    chain = registry.get(chain_key or "", get_active_chain())
    response.contract_address = chain.guest_pass_contract_address or None

    if not chain.enabled or not chain.rpc_url or not chain.guest_pass_contract_address:
        response.verify_error = "Chain RPC or guest pass contract is not configured."
        return response

    try:
        verified = verify_guest_pass_onchain(
            chain=chain,
            reservation_id=reservation_id,
            expected_token_id=response.token_id,
        )
        response.onchain_valid = bool(verified.valid)
        response.owner = verified.owner
        if not response.reservation_hash:
            response.reservation_hash = verified.reservation_hash
    except RuntimeError as exc:
        response.verify_error = str(exc)

    return response
