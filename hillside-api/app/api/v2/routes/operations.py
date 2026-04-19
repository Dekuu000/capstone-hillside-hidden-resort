import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.v2.routes._http_errors import raise_http_from_runtime_error
from pydantic import BaseModel

from app.core.auth import AuthContext, require_admin
from app.core.chains import get_active_chain, get_chain_registry
from app.core.config import settings
from app.integrations.escrow_chain import release_reservation_escrow_onchain
from app.integrations.supabase_client import (
    perform_checkin as perform_checkin_rpc,
    perform_checkout as perform_checkout_rpc,
    get_reservation_by_id,
    list_reservation_unit_ids,
    update_units_operational_status,
    update_reservation_policy_metadata,
    write_reservation_escrow_shadow_metadata,
)
from app.schemas.common import CheckOperationResponse, CheckinWelcomeNotificationSummary
from app.services.checkin_welcome import create_checkin_welcome_notification
from app.services.idempotency import (
    build_idempotency_operation_id,
    load_cached_response_payload,
    store_operation_receipt_safely,
)

router = APIRouter()
logger = logging.getLogger(__name__)
DEPOSIT_POLICY_VERSION = "v1_2026_04"
DEPOSIT_RULE_ROOM_COTTAGE = "room_cottage_20pct_clamp_500_1000"
DEPOSIT_RULE_TOUR = "tour_fixed_500_or_full_if_below_500"


class CheckOperationRequest(BaseModel):
    reservation_id: str
    scanner_id: str | None = None
    override_reason: str | None = None
    idempotency_key: str | None = None


@dataclass(frozen=True)
class EscrowReleaseOutcome:
    state: Literal["released", "pending_release", "skipped"]
    tx_hash: str | None = None
    message: str | None = None


def _safe_int(raw: object, default: int = 0) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _optional_str(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _resolve_policy_rule(reservation_row: dict) -> str:
    explicit = _optional_str(reservation_row.get("deposit_rule_applied"))
    if explicit:
        return explicit
    return DEPOSIT_RULE_TOUR if bool(reservation_row.get("service_bookings")) else DEPOSIT_RULE_ROOM_COTTAGE


def _persist_released_policy_outcome(*, reservation_id: str, reservation_row: dict) -> None:
    try:
        update_reservation_policy_metadata(
            reservation_id=reservation_id,
            deposit_policy_version=_optional_str(reservation_row.get("deposit_policy_version")) or DEPOSIT_POLICY_VERSION,
            deposit_rule_applied=_resolve_policy_rule(reservation_row),
            cancellation_actor=_optional_str(reservation_row.get("cancellation_actor")),
            policy_outcome="released",
        )
    except RuntimeError:
        logger.exception(
            "Failed to persist released policy outcome metadata (reservation_id=%s)",
            reservation_id,
        )


def _maybe_release_escrow_on_checkin(reservation_row: dict) -> EscrowReleaseOutcome:
    if not settings.feature_escrow_onchain_lock:
        return EscrowReleaseOutcome(state="skipped", message="Escrow lock feature disabled.")

    reservation_id = str(reservation_row.get("reservation_id") or "")
    if not reservation_id:
        return EscrowReleaseOutcome(state="skipped", message="Reservation id missing.")

    escrow_state = str(reservation_row.get("escrow_state") or "none").lower()
    if escrow_state != "locked":
        logger.info(
            "Escrow release skipped: reservation not locked (reservation_id=%s, escrow_state=%s)",
            reservation_id,
            escrow_state,
        )
        return EscrowReleaseOutcome(state="skipped", message=f"Reservation escrow state is '{escrow_state}'.")

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
        return EscrowReleaseOutcome(state="skipped", message=f"Chain '{chain.key}' is not fully configured.")

    attempts = _safe_int(reservation_row.get("escrow_release_attempts"), default=0) + 1
    attempt_at = datetime.now(timezone.utc).isoformat()

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
        logger.info(
            "Escrow release applied (reservation_id=%s, chain=%s, tx_hash=%s)",
            reservation_id,
            chain.key,
            settlement.tx_hash,
        )
        return EscrowReleaseOutcome(
            state="released",
            tx_hash=settlement.tx_hash,
            message="Escrow released on-chain.",
        )
    except Exception as exc:  # noqa: BLE001
        # Do not block check-in while chain settlement is under staged rollout.
        error_text = str(exc).strip() or "Unknown release error."
        chain_tx_hash = str(reservation_row.get("chain_tx_hash") or "").strip() or f"shadow-release-{reservation_id}"
        onchain_booking_id = str(reservation_row.get("onchain_booking_id") or "").strip() or None
        event_index = _safe_int(reservation_row.get("escrow_event_index"), default=0)
        try:
            write_reservation_escrow_shadow_metadata(
                reservation_id=reservation_id,
                chain_key=chain.key,
                chain_id=chain.chain_id,
                contract_address=chain.escrow_contract_address,
                tx_hash=chain_tx_hash,
                onchain_booking_id=onchain_booking_id,
                escrow_event_index=event_index,
                escrow_state="pending_release",
                escrow_release_attempts=attempts,
                escrow_release_last_attempt_at=attempt_at,
                escrow_release_last_error=error_text[:500],
            )
        except Exception:  # noqa: BLE001
            logger.exception(
                "Failed to persist pending_release metadata (reservation_id=%s, chain=%s)",
                reservation_id,
                chain.key,
            )
        logger.exception(
            "Escrow release failed (reservation_id=%s, chain=%s)",
            reservation_id,
            chain.key,
        )
        return EscrowReleaseOutcome(
            state="pending_release",
            tx_hash=str(reservation_row.get("chain_tx_hash") or "").strip() or None,
            message="Escrow release pending retry.",
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
            "guest_pass_contract_configured": bool(active_chain.guest_pass_contract_address),
        },
        "chains": {
            key: {
                "chain_id": chain.chain_id,
                "enabled": chain.enabled,
                "explorer_base_url": chain.explorer_base_url,
                "rpc_configured": bool(chain.rpc_url),
                "contract_configured": bool(chain.escrow_contract_address),
                "guest_pass_contract_configured": bool(chain.guest_pass_contract_address),
            }
            for key, chain in registry.items()
        },
    }


@router.post("/checkins", response_model=CheckOperationResponse)
def perform_checkin(
    payload: CheckOperationRequest,
    auth: AuthContext = Depends(require_admin),
):
    operation_id: str | None = None
    if payload.idempotency_key:
        operation_id = build_idempotency_operation_id(
            route_key="operations.checkins.create",
            user_id=auth.user_id,
            idempotency_key=payload.idempotency_key,
        )
        cached_payload = load_cached_response_payload(
            operation_id=operation_id,
            user_id=auth.user_id,
            idempotency_key=payload.idempotency_key,
            logger=logger,
            warning_label="Check-in",
        )
        if cached_payload:
            return cached_payload

    try:
        row = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    try:
        perform_checkin_rpc(
            access_token=auth.access_token,
            reservation_id=payload.reservation_id,
            override_reason=payload.override_reason,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        unit_ids = list_reservation_unit_ids(reservation_id=payload.reservation_id)
        update_units_operational_status(unit_ids=unit_ids, operational_status="occupied")
    except RuntimeError:
        # Do not block check-in if unit status sync fails; keep operation successful.
        logger.exception("Unit status sync failed on check-in (reservation_id=%s)", payload.reservation_id)

    release_outcome = _maybe_release_escrow_on_checkin(row)
    if release_outcome.state == "released":
        _persist_released_policy_outcome(
            reservation_id=payload.reservation_id,
            reservation_row=row,
        )
    welcome_summary = CheckinWelcomeNotificationSummary(created=False)
    try:
        summary = create_checkin_welcome_notification(
            reservation_row=row,
            created_by_user_id=auth.user_id,
        )
        if summary:
            welcome_summary = CheckinWelcomeNotificationSummary(
                created=summary.created,
                notification_id=summary.notification_id,
                fallback_used=summary.fallback_used,
                model_version=summary.model_version,
            )
    except Exception:  # noqa: BLE001
        logger.exception(
            "Check-in welcome generation failed (reservation_id=%s)",
            payload.reservation_id,
        )

    response = {
        "ok": True,
        "reservation_id": payload.reservation_id,
        "status": "checked_in",
        "scanner_id": payload.scanner_id,
        "escrow_release_state": release_outcome.state,
        "welcome_notification": welcome_summary.model_dump(),
    }
    if payload.idempotency_key and operation_id:
        store_operation_receipt_safely(
            operation_id=operation_id,
            idempotency_key=payload.idempotency_key,
            user_id=auth.user_id,
            entity_type="checkin",
            entity_id=payload.reservation_id,
            action="operations.checkins.create",
            response_payload=response,
            logger=logger,
            warning_label="Check-in",
        )
    return response


@router.post("/checkouts", response_model=CheckOperationResponse)
def perform_checkout(
    payload: CheckOperationRequest,
    auth: AuthContext = Depends(require_admin),
):
    operation_id: str | None = None
    if payload.idempotency_key:
        operation_id = build_idempotency_operation_id(
            route_key="operations.checkouts.create",
            user_id=auth.user_id,
            idempotency_key=payload.idempotency_key,
        )
        cached_payload = load_cached_response_payload(
            operation_id=operation_id,
            user_id=auth.user_id,
            idempotency_key=payload.idempotency_key,
            logger=logger,
            warning_label="Check-out",
        )
        if cached_payload:
            return cached_payload

    try:
        row = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    balance_due = float(row.get("balance_due") or 0)
    if balance_due > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Remaining balance must be settled before check-out. Outstanding: {balance_due:.2f}",
        )

    try:
        perform_checkout_rpc(access_token=auth.access_token, reservation_id=payload.reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        unit_ids = list_reservation_unit_ids(reservation_id=payload.reservation_id)
        update_units_operational_status(unit_ids=unit_ids, operational_status="dirty")
    except RuntimeError:
        # Do not block check-out if unit status sync fails; keep operation successful.
        logger.exception("Unit status sync failed on check-out (reservation_id=%s)", payload.reservation_id)

    response = {
        "ok": True,
        "reservation_id": payload.reservation_id,
        "status": "checked_out",
        "scanner_id": payload.scanner_id,
    }
    if payload.idempotency_key and operation_id:
        store_operation_receipt_safely(
            operation_id=operation_id,
            idempotency_key=payload.idempotency_key,
            user_id=auth.user_id,
            entity_type="checkout",
            entity_id=payload.reservation_id,
            action="operations.checkouts.create",
            response_payload=response,
            logger=logger,
            warning_label="Check-out",
        )
    return response
