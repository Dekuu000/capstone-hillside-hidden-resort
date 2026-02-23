from datetime import date
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import (
    AuthContext,
    ensure_reservation_access,
    require_admin,
    require_authenticated,
)
from app.core.chains import get_active_chain, get_chain_registry
from app.core.config import settings
from app.integrations.ai_pricing import get_pricing_recommendation
from app.integrations.escrow_chain import (
    lock_reservation_escrow_onchain,
    refund_reservation_escrow_onchain,
)
from app.integrations.guest_pass_chain import mint_guest_pass_onchain
from app.integrations.supabase_client import (
    write_reservation_escrow_shadow_metadata,
    write_reservation_guest_pass_metadata,
    create_tour_reservation_atomic as create_tour_reservation_atomic_rpc,
    create_reservation_atomic as create_reservation_atomic_rpc,
    update_reservation_status as update_reservation_status_rpc,
    get_active_service_by_id as get_active_service_by_id_rpc,
    get_available_units as get_available_units_rpc,
    cancel_reservation as cancel_reservation_rpc,
    get_reservation_by_code,
    get_reservation_by_id,
    list_recent_reservations,
)
from app.schemas.common import (
    AiRecommendation,
    BookingStatus,
    EscrowRef,
    GuestPassRef,
    ReservationCreateRequest,
    ReservationResponse,
    TourReservationCreateRequest,
)
from app.schemas.common import (
    CancelReservationResponse,
    ReservationStatusUpdateRequest,
    ReservationStatusUpdateResponse,
    ReservationListItem,
    ReservationListResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _maybe_get_ai_recommendation(
    *,
    reservation_id: str,
    context: dict,
) -> AiRecommendation | None:
    try:
        return get_pricing_recommendation(
            reservation_id=reservation_id,
            context=context,
            allow_remote=True,
        )
    except Exception:  # noqa: BLE001
        logger.exception("AI recommendation failed (reservation_id=%s)", reservation_id)
        return None


def _maybe_apply_escrow_shadow_write(reservation_id: str) -> EscrowRef | None:
    if not settings.feature_escrow_shadow_write:
        logger.info("Escrow shadow-write skipped: feature disabled (reservation_id=%s)", reservation_id)
        return None

    active_chain = get_active_chain()
    if not active_chain.enabled:
        logger.warning(
            "Escrow shadow-write skipped: active chain disabled (reservation_id=%s, chain=%s)",
            reservation_id,
            active_chain.key,
        )
        return None
    if not active_chain.rpc_url or not active_chain.escrow_contract_address:
        logger.warning(
            "Escrow shadow-write skipped: chain not fully configured (reservation_id=%s, chain=%s, rpc=%s, contract=%s)",
            reservation_id,
            active_chain.key,
            bool(active_chain.rpc_url),
            bool(active_chain.escrow_contract_address),
        )
        return None
    if settings.feature_escrow_onchain_lock and not active_chain.signer_private_key:
        logger.warning(
            "Escrow lock skipped: signer key missing (reservation_id=%s, chain=%s)",
            reservation_id,
            active_chain.key,
        )
        return None

    if settings.feature_escrow_onchain_lock:
        try:
            lock_result = lock_reservation_escrow_onchain(
                chain=active_chain,
                reservation_id=reservation_id,
            )
            write_reservation_escrow_shadow_metadata(
                reservation_id=reservation_id,
                chain_key=active_chain.key,
                chain_id=active_chain.chain_id,
                contract_address=active_chain.escrow_contract_address,
                tx_hash=lock_result.tx_hash,
                onchain_booking_id=lock_result.onchain_booking_id,
                escrow_event_index=lock_result.event_index,
                escrow_state="locked",
            )
        except RuntimeError:
            logger.exception(
                "Escrow on-chain lock failed (reservation_id=%s, chain=%s)",
                reservation_id,
                active_chain.key,
            )
            return None

        logger.info(
            "Escrow on-chain lock applied (reservation_id=%s, chain=%s, tx_hash=%s)",
            reservation_id,
            active_chain.key,
            lock_result.tx_hash,
        )

        return EscrowRef(
            chain_key=active_chain.key,  # type: ignore[arg-type]
            chain_id=active_chain.chain_id,
            contract_address=active_chain.escrow_contract_address,
            tx_hash=lock_result.tx_hash,
            event_index=lock_result.event_index,
            state="locked",
        )

    tx_hash = f"shadow-{uuid4().hex}"
    try:
        write_reservation_escrow_shadow_metadata(
            reservation_id=reservation_id,
            chain_key=active_chain.key,
            chain_id=active_chain.chain_id,
            contract_address=active_chain.escrow_contract_address,
            tx_hash=tx_hash,
            onchain_booking_id=reservation_id,
            escrow_event_index=0,
            escrow_state="pending_lock",
        )
    except RuntimeError:
        # Shadow-write is non-blocking while we are in feature-flagged rollout mode.
        logger.exception(
            "Escrow shadow-write failed (reservation_id=%s, chain=%s, tx_hash=%s)",
            reservation_id,
            active_chain.key,
            tx_hash,
        )
        return None

    logger.info(
        "Escrow shadow-write applied (reservation_id=%s, chain=%s, tx_hash=%s)",
        reservation_id,
        active_chain.key,
        tx_hash,
    )

    return EscrowRef(
        chain_key=active_chain.key,  # type: ignore[arg-type]
        chain_id=active_chain.chain_id,
        contract_address=active_chain.escrow_contract_address,
        tx_hash=tx_hash,
        event_index=0,
        state="pending",
    )


def _maybe_mint_guest_pass(reservation_id: str) -> GuestPassRef | None:
    if not settings.feature_nft_guest_pass:
        logger.info("Guest pass mint skipped: feature disabled (reservation_id=%s)", reservation_id)
        return None

    active_chain = get_active_chain()
    if not active_chain.enabled:
        logger.warning(
            "Guest pass mint skipped: active chain disabled (reservation_id=%s, chain=%s)",
            reservation_id,
            active_chain.key,
        )
        return None
    if not active_chain.rpc_url or not active_chain.guest_pass_contract_address:
        logger.warning(
            "Guest pass mint skipped: chain not fully configured (reservation_id=%s, chain=%s, rpc=%s, nft_contract=%s)",
            reservation_id,
            active_chain.key,
            bool(active_chain.rpc_url),
            bool(active_chain.guest_pass_contract_address),
        )
        return None
    if not active_chain.signer_private_key:
        logger.warning(
            "Guest pass mint skipped: signer key missing (reservation_id=%s, chain=%s)",
            reservation_id,
            active_chain.key,
        )
        return None

    try:
        mint_result = mint_guest_pass_onchain(
            chain=active_chain,
            reservation_id=reservation_id,
        )
        write_reservation_guest_pass_metadata(
            reservation_id=reservation_id,
            token_id=mint_result.token_id,
            tx_hash=mint_result.tx_hash,
            chain_key=active_chain.key,
            reservation_hash=mint_result.reservation_hash,
        )
    except RuntimeError:
        logger.exception(
            "Guest pass mint failed (reservation_id=%s, chain=%s)",
            reservation_id,
            active_chain.key,
        )
        return None

    logger.info(
        "Guest pass minted (reservation_id=%s, chain=%s, token_id=%s, tx_hash=%s)",
        reservation_id,
        active_chain.key,
        mint_result.token_id,
        mint_result.tx_hash,
    )
    return GuestPassRef(
        chain_key=active_chain.key,  # type: ignore[arg-type]
        contract_address=active_chain.guest_pass_contract_address,
        tx_hash=mint_result.tx_hash,
        token_id=mint_result.token_id,
        reservation_hash=mint_result.reservation_hash,
        owner=mint_result.recipient,
    )


def _maybe_refund_escrow_on_cancel(reservation_row: dict) -> None:
    if not settings.feature_escrow_onchain_lock:
        return

    reservation_id = str(reservation_row.get("reservation_id") or "")
    if not reservation_id:
        return

    escrow_state = str(reservation_row.get("escrow_state") or "none").lower()
    if escrow_state != "locked":
        logger.info(
            "Escrow refund skipped: reservation not locked (reservation_id=%s, escrow_state=%s)",
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
            "Escrow refund skipped: chain not fully configured (reservation_id=%s, chain=%s)",
            reservation_id,
            chain.key,
        )
        return

    try:
        settlement = refund_reservation_escrow_onchain(
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
            escrow_state="refunded",
        )
        logger.info(
            "Escrow refund applied (reservation_id=%s, chain=%s, tx_hash=%s)",
            reservation_id,
            chain.key,
            settlement.tx_hash,
        )
    except RuntimeError:
        # Do not block cancellation while release flow is still in staged rollout.
        logger.exception(
            "Escrow refund failed (reservation_id=%s, chain=%s)",
            reservation_id,
            chain.key,
        )


@router.post("", response_model=ReservationResponse)
def create_reservation(
    payload: ReservationCreateRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    if payload.check_out_date <= payload.check_in_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="check_out_date must be after check_in_date.",
        )
    if not payload.unit_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one unit_id is required.",
        )

    try:
        available_units = get_available_units_rpc(
            check_in_date=payload.check_in_date.isoformat(),
            check_out_date=payload.check_out_date.isoformat(),
            unit_type=None,
        )
    except RuntimeError as exc:
        code = status.HTTP_503_SERVICE_UNAVAILABLE if "not configured" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc

    unit_map = {str(unit.get("unit_id")): unit for unit in available_units}
    missing = [unit_id for unit_id in payload.unit_ids if unit_id not in unit_map]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="One or more selected units are no longer available.",
        )

    nights = (payload.check_out_date - payload.check_in_date).days
    rates: list[float] = []
    total_amount = 0.0
    for unit_id in payload.unit_ids:
        base_price = float(unit_map[unit_id].get("base_price") or 0)
        rates.append(base_price)
        total_amount += base_price * nights

    try:
        created = create_reservation_atomic_rpc(
            access_token=auth.access_token,
            guest_user_id=auth.user_id,
            check_in_date=payload.check_in_date.isoformat(),
            check_out_date=payload.check_out_date.isoformat(),
            unit_ids=payload.unit_ids,
            rates=rates,
            total_amount=total_amount,
            notes=None,
        )
    except RuntimeError as exc:
        code = status.HTTP_503_SERVICE_UNAVAILABLE if "not configured" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc

    status_text = str(created.get("status") or BookingStatus.PENDING_PAYMENT.value)
    try:
        status_enum = BookingStatus(status_text)
    except ValueError:
        status_enum = BookingStatus.PENDING_PAYMENT

    reservation_id = str(created.get("reservation_id") or "")
    ai_recommendation = _maybe_get_ai_recommendation(
        reservation_id=reservation_id,
        context={
            "check_in_date": payload.check_in_date.isoformat(),
            "check_out_date": payload.check_out_date.isoformat(),
            "total_amount": total_amount,
            "nights": nights,
            "unit_count": len(payload.unit_ids),
            "party_size": sum(int(unit_map[unit_id].get("capacity") or 1) for unit_id in payload.unit_ids),
            "is_weekend": payload.check_in_date.weekday() >= 5,
            "is_tour": False,
        },
    )
    return ReservationResponse(
        reservation_id=reservation_id,
        reservation_code=str(created.get("reservation_code") or ""),
        status=status_enum,
        escrow_ref=_maybe_apply_escrow_shadow_write(reservation_id),
        guest_pass_ref=_maybe_mint_guest_pass(reservation_id),
        ai_recommendation=ai_recommendation,
    )


@router.post("/tours", response_model=ReservationResponse)
def create_tour_reservation(
    payload: TourReservationCreateRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    if payload.adult_qty + payload.kid_qty <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one guest is required.",
        )
    today = date.today()
    if payload.visit_date < today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="visit_date cannot be in the past.",
        )
    if auth.role != "admin" and payload.visit_date <= today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="visit_date must be in the future.",
        )
    if auth.role != "admin" and not payload.is_advance:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create walk-in tour reservations.",
        )

    try:
        service = get_active_service_by_id_rpc(payload.service_id)
    except RuntimeError as exc:
        code = status.HTTP_503_SERVICE_UNAVAILABLE if "not configured" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc

    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found or inactive.",
        )

    adult_rate = float(service.get("adult_rate") or 0)
    kid_rate = float(service.get("kid_rate") or 0)
    total_amount = payload.adult_qty * adult_rate + payload.kid_qty * kid_rate
    if total_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Computed total amount must be greater than zero.",
        )

    try:
        created = create_tour_reservation_atomic_rpc(
            access_token=auth.access_token,
            guest_user_id=auth.user_id,
            service_id=payload.service_id,
            visit_date=payload.visit_date.isoformat(),
            adult_qty=payload.adult_qty,
            kid_qty=payload.kid_qty,
            is_advance=payload.is_advance,
            expected_pay_now=payload.expected_pay_now,
            notes=payload.notes,
        )
    except RuntimeError as exc:
        code = status.HTTP_503_SERVICE_UNAVAILABLE if "not configured" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc

    status_text = str(created.get("status") or BookingStatus.PENDING_PAYMENT.value)
    try:
        status_enum = BookingStatus(status_text)
    except ValueError:
        status_enum = BookingStatus.PENDING_PAYMENT

    reservation_id = str(created.get("reservation_id") or "")
    ai_recommendation = _maybe_get_ai_recommendation(
        reservation_id=reservation_id,
        context={
            "visit_date": payload.visit_date.isoformat(),
            "total_amount": total_amount,
            "nights": 1,
            "unit_count": 1,
            "party_size": payload.adult_qty + payload.kid_qty,
            "is_weekend": payload.visit_date.weekday() >= 5,
            "is_tour": True,
        },
    )
    return ReservationResponse(
        reservation_id=reservation_id,
        reservation_code=str(created.get("reservation_code") or ""),
        status=status_enum,
        escrow_ref=_maybe_apply_escrow_shadow_write(reservation_id),
        guest_pass_ref=_maybe_mint_guest_pass(reservation_id),
        ai_recommendation=ai_recommendation,
    )


@router.get("", response_model=ReservationListResponse)
def get_reservations(
    limit: int = Query(default=10, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=120),
    sort_by: str | None = Query(default="created_at"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    _auth: AuthContext = Depends(require_admin),
):
    try:
        rows, total = list_recent_reservations(
            limit=limit,
            offset=offset,
            status_filter=status_filter,
            search=search,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return {
        "items": rows,
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


@router.get("/by-code/{reservation_code}", response_model=ReservationListItem)
def get_reservation_by_reservation_code(
    reservation_code: str,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        row = get_reservation_by_code(reservation_code)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    ensure_reservation_access(auth, row)
    return row


@router.get("/{reservation_id}", response_model=ReservationListItem)
def get_reservation(
    reservation_id: str,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        row = get_reservation_by_id(reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if row:
        ensure_reservation_access(auth, row)
        return row

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")


@router.patch("/{reservation_id}/status", response_model=ReservationStatusUpdateResponse)
def patch_reservation_status(
    reservation_id: str,
    payload: ReservationStatusUpdateRequest,
    auth: AuthContext = Depends(require_admin),
):
    try:
        current = get_reservation_by_id(reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    try:
        updated = update_reservation_status_rpc(
            access_token=auth.access_token,
            reservation_id=reservation_id,
            status=payload.status.value,
            notes=payload.notes,
            include_notes="notes" in payload.model_fields_set,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    if payload.status == BookingStatus.CANCELLED:
        _maybe_refund_escrow_on_cancel(current)

    return {"ok": True, "reservation": updated}


@router.post("/{reservation_id}/cancel", response_model=CancelReservationResponse)
def cancel_reservation(
    reservation_id: str,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        row = get_reservation_by_id(reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    ensure_reservation_access(auth, row)
    current_status = str(row.get("status") or "").lower()
    if current_status in {"cancelled", "checked_out", "no_show"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reservation cannot be cancelled in its current status.",
        )

    try:
        cancel_reservation_rpc(access_token=auth.access_token, reservation_id=reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    _maybe_refund_escrow_on_cancel(row)

    return {"ok": True, "reservation_id": reservation_id, "status": "cancelled"}
