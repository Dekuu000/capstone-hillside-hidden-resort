from datetime import date, datetime, timedelta, timezone
import logging
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.api.v2.routes._http_errors import raise_http_from_runtime_error

from app.core.auth import (
    AuthContext,
    ensure_reservation_access,
    require_admin,
    require_authenticated,
    require_operations,
    role_at_least,
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
    cascade_service_bookings_no_show,
    emit_notification,
    emit_notification_to_roles,
    get_active_service_by_id as get_active_service_by_id_rpc,
    get_available_units as get_available_units_rpc,
    cancel_reservation as cancel_reservation_rpc,
    get_reservation_by_code,
    get_reservation_by_id,
    get_dynamic_pricing_signals,
    get_reservation_quick_stats,
    list_recent_reservations,
    release_expired_pending_payment_holds,
    record_escrow_transition,
    notify_ops_paid_cancellation,
    update_reservation_policy_metadata,
    update_reservation_source as update_reservation_source_rpc,
)
from app.schemas.common import (
    AiRecommendation,
    BookingStatus,
    EscrowRef,
    GuestPassRef,
    ReservationCreateRequest,
    ReservationResponse,
    TourReservationCreateRequest,
    WalkInStayCreateRequest,
)
from app.schemas.common import (
    CancelReservationResponse,
    ReservationStatusUpdateRequest,
    ReservationStatusUpdateResponse,
    ReservationAdminDetailItem,
    ReservationListItem,
    ReservationListResponse,
    ReservationQuickStatsResponse,
)
from app.services.idempotency import (
    build_idempotency_operation_id,
    load_cached_response_payload,
    store_operation_receipt_safely,
)
from app.services.payment_policy import CancellationPolicyDecision, resolve_cancellation_policy

router = APIRouter()
logger = logging.getLogger(__name__)

DEPOSIT_POLICY_VERSION = "v1_2026_04"
DEPOSIT_RULE_ROOM_COTTAGE = "room_cottage_20pct_clamp_500_1000"
DEPOSIT_RULE_TOUR = "tour_fixed_500_or_full_if_below_500"

PAX_BASED_STAY_UNIT_RULES: dict[str, tuple[int, float, float]] = {
    # unit_code: (included_pax, fallback_min_rate, extra_pax_rate)
    "AMN-EVERGREEN-PAVILION": (30, 8500.0, 250.0),
    "AMN-PINECREST-EXCLUSIVE": (20, 12000.0, 400.0),
}


def _to_optional_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_optional_str(value: object) -> str | None:
    candidate = str(value or "").strip()
    return candidate or None


def _resolve_policy_rule(*, is_tour: bool, explicit_rule: str | None) -> str:
    candidate = (explicit_rule or "").strip()
    if candidate:
        return candidate
    return DEPOSIT_RULE_TOUR if is_tour else DEPOSIT_RULE_ROOM_COTTAGE


def _reservation_policy_fields(source: dict, *, is_tour: bool) -> dict[str, float | str | None]:
    return {
        "deposit_required": _to_optional_float(source.get("deposit_required")),
        "expected_pay_now": _to_optional_float(source.get("expected_pay_now")),
        "deposit_policy_version": _to_optional_str(source.get("deposit_policy_version")) or DEPOSIT_POLICY_VERSION,
        "deposit_rule_applied": _resolve_policy_rule(
            is_tour=is_tour,
            explicit_rule=_to_optional_str(source.get("deposit_rule_applied")),
        ),
        "cancellation_actor": _to_optional_str(source.get("cancellation_actor")),
        "policy_outcome": _to_optional_str(source.get("policy_outcome")),
    }


def _resolve_reservation_policy_rule(row: dict) -> str:
    return _resolve_policy_rule(
        is_tour=bool(row.get("service_bookings")),
        explicit_rule=_to_optional_str(row.get("deposit_rule_applied")),
    )


def _resolve_reservation_policy_version(row: dict) -> str:
    return _to_optional_str(row.get("deposit_policy_version")) or DEPOSIT_POLICY_VERSION


def _try_replay_reservation_response(
    *,
    route_key: str,
    user_id: str,
    idempotency_key: str | None,
) -> ReservationResponse | None:
    if not idempotency_key:
        return None
    operation_id = build_idempotency_operation_id(
        route_key=route_key,
        user_id=user_id,
        idempotency_key=idempotency_key,
    )
    payload = load_cached_response_payload(
        operation_id=operation_id,
        user_id=user_id,
        idempotency_key=idempotency_key,
        logger=logger,
        warning_label=f"Reservation ({route_key})",
    )
    if not payload:
        return None
    try:
        return ReservationResponse(**payload)
    except Exception:  # noqa: BLE001
        return None


def _store_reservation_idempotency_receipt(
    *,
    route_key: str,
    user_id: str,
    idempotency_key: str | None,
    reservation: ReservationResponse,
) -> None:
    if not idempotency_key:
        return
    operation_id = build_idempotency_operation_id(
        route_key=route_key,
        user_id=user_id,
        idempotency_key=idempotency_key,
    )
    store_operation_receipt_safely(
        operation_id=operation_id,
        idempotency_key=idempotency_key,
        user_id=user_id,
        entity_type="reservation",
        entity_id=reservation.reservation_id,
        action=route_key,
        response_payload=reservation.model_dump(mode="json"),
        logger=logger,
        warning_label=f"Reservation ({route_key})",
    )


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
    # This applies escrow on payment: a real on-chain lock when
    # FEATURE_ESCROW_ONCHAIN_LOCK is on, otherwise a shadow-write audit record
    # when FEATURE_ESCROW_SHADOW_WRITE is on. Only skip when BOTH are off — the
    # on-chain lock must not be gated behind shadow-write.
    if not settings.feature_escrow_shadow_write and not settings.feature_escrow_onchain_lock:
        logger.info("Escrow apply skipped: shadow-write and on-chain lock both disabled (reservation_id=%s)", reservation_id)
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
    chain_enabled = bool(getattr(active_chain, "enabled", False))
    chain_key = str(getattr(active_chain, "key", "unknown"))
    chain_rpc_url = str(getattr(active_chain, "rpc_url", "") or "")
    chain_contract = str(getattr(active_chain, "guest_pass_contract_address", "") or "")
    chain_signer = str(getattr(active_chain, "signer_private_key", "") or "")
    if not chain_enabled:
        logger.warning(
            "Guest pass mint skipped: active chain disabled (reservation_id=%s, chain=%s)",
            reservation_id,
            chain_key,
        )
        return None
    if not chain_rpc_url or not chain_contract:
        logger.warning(
            "Guest pass mint skipped: chain not fully configured (reservation_id=%s, chain=%s, rpc=%s, nft_contract=%s)",
            reservation_id,
            chain_key,
            bool(chain_rpc_url),
            bool(chain_contract),
        )
        return None
    if not chain_signer:
        logger.warning(
            "Guest pass mint skipped: signer key missing (reservation_id=%s, chain=%s)",
            reservation_id,
            chain_key,
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
            chain_key,
        )
        return None

    logger.info(
        "Guest pass minted (reservation_id=%s, chain=%s, token_id=%s, tx_hash=%s)",
        reservation_id,
        chain_key,
        mint_result.token_id,
        mint_result.tx_hash,
    )
    return GuestPassRef(
        chain_key=chain_key,  # type: ignore[arg-type]
        contract_address=chain_contract,
        tx_hash=mint_result.tx_hash,
        token_id=mint_result.token_id,
        reservation_hash=mint_result.reservation_hash,
        owner=mint_result.recipient,
    )


def _schedule_guest_pass_mint(background_tasks: BackgroundTasks, reservation_id: str) -> None:
    """Mint the NFT guest pass off the request's critical path.

    The on-chain mint can take 10s+ waiting for a tx receipt, which would stall
    the guest's "continue to payment" step. Defer it to a background task so the
    reservation response returns immediately; the pass metadata is written to the
    reservation row a moment later. Returns None so the create response carries
    guest_pass_ref=None (the guest UI does not surface the pass)."""
    background_tasks.add_task(_maybe_mint_guest_pass, reservation_id)
    return None


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


def _derive_cancellation_policy(*, actor_role: str, reservation_row: dict) -> CancellationPolicyDecision:
    return resolve_cancellation_policy(
        actor_role=actor_role,
        paid_amount=reservation_row.get("amount_paid_verified"),
        minimum_deposit=reservation_row.get("deposit_required"),
    )


def _apply_cancellation_policy_metadata(
    *,
    reservation_id: str,
    actor: str,
    outcome: str,
    rule_applied: str | None = None,
) -> None:
    try:
        update_reservation_policy_metadata(
            reservation_id=reservation_id,
            deposit_policy_version=DEPOSIT_POLICY_VERSION,
            deposit_rule_applied=rule_applied or DEPOSIT_RULE_ROOM_COTTAGE,
            cancellation_actor=actor,
            policy_outcome=outcome,
        )
    except RuntimeError:
        logger.exception(
            "Failed to persist cancellation policy metadata (reservation_id=%s, actor=%s, outcome=%s)",
            reservation_id,
            actor,
            outcome,
        )


def _get_reservation_or_404(reservation_id: str) -> dict:
    try:
        row = get_reservation_by_id(reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    return row


def _ensure_reservation_cancellable(row: dict) -> None:
    current_status = str(row.get("status") or "").lower()
    if current_status in {"cancelled", "checked_out", "no_show"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reservation cannot be cancelled in its current status.",
        )


def _apply_cancellation_side_effects(
    *,
    reservation_id: str,
    reservation_row: dict,
    actor_role: str,
) -> CancellationPolicyDecision:
    decision = _derive_cancellation_policy(actor_role=actor_role, reservation_row=reservation_row)
    _apply_cancellation_policy_metadata(
        reservation_id=reservation_id,
        actor=decision.actor,
        outcome=decision.outcome,
        rule_applied=_resolve_reservation_policy_rule(reservation_row),
    )
    if decision.outcome == "refunded":
        _maybe_refund_escrow_on_cancel(reservation_row)
    paid_amount = float(reservation_row.get("amount_paid_verified") or 0)
    record_escrow_transition(
        reservation_id=reservation_id,
        event="refund" if decision.outcome == "refunded" else "forfeit",
        reservation_code=str(reservation_row.get("reservation_code") or "") or None,
        escrow_state_from=str(reservation_row.get("escrow_state") or "none"),
        policy_outcome=decision.outcome,
        amount=paid_amount,
        reason=f"{decision.actor}_cancellation",
        actor_role=decision.actor,
    )
    # Managers only: a PAID booking was cancelled (refund due, or deposit kept).
    # Unpaid cancellations stay silent for the back office.
    if paid_amount > 0:
        notify_ops_paid_cancellation(
            reservation=reservation_row,
            outcome=decision.outcome,
            amount=paid_amount,
        )
    return decision


def _apply_no_show_side_effects(*, reservation_id: str, reservation_row: dict) -> None:
    """Manual no-show (admin): forfeit the deposit + cascade to service bookings,
    then notify the guest and the back office. Status is already set by the caller."""
    _apply_cancellation_policy_metadata(
        reservation_id=reservation_id,
        actor="admin",
        outcome="forfeited",
        rule_applied=_resolve_reservation_policy_rule(reservation_row),
    )
    record_escrow_transition(
        reservation_id=reservation_id,
        event="forfeit",
        reservation_code=str(reservation_row.get("reservation_code") or "") or None,
        escrow_state_from=str(reservation_row.get("escrow_state") or "none"),
        policy_outcome="forfeited",
        amount=float(reservation_row.get("amount_paid_verified") or 0),
        reason="no_show",
        actor_role="admin",
    )
    cascade_service_bookings_no_show(reservation_id=reservation_id)

    code = str(reservation_row.get("reservation_code") or "")
    guest_id = reservation_row.get("guest_user_id")
    if guest_id:
        emit_notification(
            recipient_user_id=str(guest_id),
            category="reservation",
            event_type="reservation.no_show",
            title="Marked as no-show",
            body=(
                f"Reservation {code} was marked as a no-show. The deposit is "
                "non-refundable per the booking policy."
            ),
            severity="warning",
            entity_type="reservation",
            entity_id=reservation_id,
            link="/my-bookings",
            dedupe_key=f"no_show:{reservation_id}",
        )
    emit_notification_to_roles(
        min_role="staff",
        category="reservation",
        event_type="ops.no_show",
        title="Guest no-show",
        body=f"{code} was marked a no-show by staff. Deposit forfeited; the unit/slot is now free.",
        severity="warning",
        entity_type="reservation",
        entity_id=reservation_id,
        link="/admin/reservations",
        dedupe_prefix=f"ops_no_show:{reservation_id}",
    )


def _build_cancel_response(
    *,
    reservation_id: str,
    reservation_row: dict,
    decision: CancellationPolicyDecision,
) -> dict[str, str | bool | float | None]:
    return {
        "ok": True,
        "reservation_id": reservation_id,
        "status": "cancelled",
        "deposit_policy_version": _resolve_reservation_policy_version(reservation_row),
        "deposit_rule_applied": _resolve_reservation_policy_rule(reservation_row),
        "cancellation_actor": decision.actor,
        "policy_outcome": decision.outcome,
        "paid_amount": decision.paid_amount,
        "minimum_deposit": decision.minimum_deposit,
        "refundable_amount": decision.refundable_amount,
        "non_refundable_amount": decision.non_refundable_amount,
    }


def _validate_stay_reservation_inputs(
    *,
    check_in_date: date,
    check_out_date: date,
    unit_ids: list[str],
    require_future_check_in: bool = False,
) -> None:
    if check_out_date <= check_in_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="check_out_date must be after check_in_date.",
        )
    if require_future_check_in and check_in_date < date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="check_in_date cannot be in the past.",
        )
    if not unit_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="At least one unit_id is required.",
        )


def _pending_payment_hold_cutoff_utc() -> datetime:
    hold_minutes = max(5, int(settings.reservation_pending_payment_hold_minutes or 120))
    return datetime.now(timezone.utc) - timedelta(minutes=hold_minutes)


def _release_expired_pending_payment_holds() -> None:
    try:
        released = release_expired_pending_payment_holds(
            older_than_utc=_pending_payment_hold_cutoff_utc(),
            limit=max(10, int(settings.reservation_hold_cleanup_batch_size or 200)),
        )
    except RuntimeError:
        logger.exception("Failed to release expired pending-payment holds before availability check.")
        return
    if released > 0:
        logger.info("Released %s expired pending-payment hold(s) before availability query.", released)


def _get_available_unit_map(*, check_in_date: date, check_out_date: date) -> dict[str, dict]:
    _release_expired_pending_payment_holds()
    try:
        available_units = get_available_units_rpc(
            check_in_date=check_in_date.isoformat(),
            check_out_date=check_out_date.isoformat(),
            unit_type=None,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_400_BAD_REQUEST)
    return {str(unit.get("unit_id")): unit for unit in available_units}


def _ensure_selected_units_available(*, unit_ids: list[str], unit_map: dict[str, dict]) -> None:
    missing = [unit_id for unit_id in unit_ids if unit_id not in unit_map]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "One or more selected units are no longer available for the selected dates. "
                "Please choose another unit or adjust your stay dates."
            ),
        )


def _ensure_guest_count_within_capacity(
    *,
    unit_ids: list[str],
    unit_map: dict[str, dict],
    guest_count: int,
) -> None:
    # Some legacy/read-model projections don't always include capacity.
    # Fall back to a safe minimum of 1 so contract paths remain backward compatible.
    total_capacity = sum(max(1, int(unit_map[unit_id].get("capacity") or 1)) for unit_id in unit_ids)
    if guest_count > total_capacity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Selected units can host up to {total_capacity} guest(s).",
        )


def _compute_stay_rates_and_total(
    *,
    check_in_date: date,
    check_out_date: date,
    unit_ids: list[str],
    unit_map: dict[str, dict],
    guest_count: int | None = None,
) -> tuple[int, list[float], float]:
    nights = (check_out_date - check_in_date).days
    rates: list[float] = []
    total_amount = 0.0
    for unit_id in unit_ids:
        unit = unit_map[unit_id]
        base_price = float(unit.get("base_price") or 0)
        unit_code = str(unit.get("unit_code") or "").upper()
        rate = base_price
        if guest_count and unit_code in PAX_BASED_STAY_UNIT_RULES:
            included_pax, fallback_min_rate, extra_pax_rate = PAX_BASED_STAY_UNIT_RULES[unit_code]
            min_rate = base_price if base_price > 0 else fallback_min_rate
            extra_pax = max(0, int(guest_count) - included_pax)
            rate = min_rate + (extra_pax * extra_pax_rate)
        rates.append(rate)
        total_amount += rate * nights
    return nights, rates, total_amount


def _build_walk_in_notes(payload: WalkInStayCreateRequest) -> str | None:
    notes_parts = [
        "Walk-in stay booking (admin).",
        f"Guest: {payload.guest_name.strip()}" if payload.guest_name and payload.guest_name.strip() else None,
        f"Phone: {payload.guest_phone.strip()}" if payload.guest_phone and payload.guest_phone.strip() else None,
        payload.notes.strip() if payload.notes and payload.notes.strip() else None,
    ]
    notes = " | ".join(part for part in notes_parts if part)
    return notes or None


def _parse_booking_status(raw_status: object) -> BookingStatus:
    status_text = str(raw_status or BookingStatus.PENDING_PAYMENT.value)
    try:
        return BookingStatus(status_text)
    except ValueError:
        return BookingStatus.PENDING_PAYMENT


def _persist_reservation_source(*, reservation_id: str, source_value: str) -> None:
    try:
        update_reservation_source_rpc(reservation_id=reservation_id, reservation_source=source_value)
    except RuntimeError:
        logger.exception("Failed to set reservation source=%s (reservation_id=%s)", source_value, reservation_id)


def _load_pricing_signals(*, target_date: date) -> dict:
    try:
        return get_dynamic_pricing_signals(target_date=target_date.isoformat(), days=45)
    except RuntimeError:
        return {}


def _validate_tour_reservation_inputs(
    *,
    adult_qty: int,
    kid_qty: int,
    visit_date: date,
    auth_role: str,
    is_advance: bool,
) -> None:
    if adult_qty + kid_qty <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="At least one guest is required.",
        )
    today = date.today()
    if visit_date < today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="visit_date cannot be in the past.",
        )
    if not role_at_least(auth_role, "staff") and visit_date <= today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="visit_date must be in the future.",
        )
    if not role_at_least(auth_role, "staff") and not is_advance:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only resort staff can create walk-in tour reservations.",
        )


def _get_active_tour_service_or_404(service_id: str) -> dict:
    try:
        service = get_active_service_by_id_rpc(service_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_400_BAD_REQUEST)

    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found or inactive.",
        )
    return service


def _compute_tour_total_amount(*, service: dict, adult_qty: int, kid_qty: int) -> float:
    adult_rate = float(service.get("adult_rate") or 0)
    kid_rate = float(service.get("kid_rate") or 0)
    total_amount = adult_qty * adult_rate + kid_qty * kid_rate
    if total_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Computed total amount must be greater than zero.",
        )
    return total_amount


def _resolve_tour_reservation_source(*, auth_role: str, is_advance: bool) -> str:
    return "walk_in" if role_at_least(auth_role, "staff") and not is_advance else "online"


def _ensure_guest_only_online_booking(auth: AuthContext) -> None:
    if role_at_least(auth.role, "staff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot create online guest reservations. Use Walk-in flow.",
        )


@router.post("", response_model=ReservationResponse)
def create_reservation(
    payload: ReservationCreateRequest,
    background_tasks: BackgroundTasks,
    auth: AuthContext = Depends(require_authenticated),
):
    _ensure_guest_only_online_booking(auth)
    replayed = _try_replay_reservation_response(
        route_key="reservations.create",
        user_id=auth.user_id,
        idempotency_key=payload.idempotency_key,
    )
    if replayed:
        return replayed

    _validate_stay_reservation_inputs(
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        unit_ids=payload.unit_ids,
    )
    unit_map = _get_available_unit_map(
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
    )
    _ensure_selected_units_available(unit_ids=payload.unit_ids, unit_map=unit_map)
    _ensure_guest_count_within_capacity(
        unit_ids=payload.unit_ids,
        unit_map=unit_map,
        guest_count=payload.guest_count,
    )
    nights, rates, total_amount = _compute_stay_rates_and_total(
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        unit_ids=payload.unit_ids,
        unit_map=unit_map,
        guest_count=payload.guest_count,
    )

    try:
        created = create_reservation_atomic_rpc(
            access_token=auth.access_token,
            guest_user_id=auth.user_id,
            check_in_date=payload.check_in_date.isoformat(),
            check_out_date=payload.check_out_date.isoformat(),
            unit_ids=payload.unit_ids,
            rates=rates,
            total_amount=total_amount,
            guest_count=payload.guest_count,
            notes=None,
            promo_code=payload.promo_code,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_400_BAD_REQUEST)

    status_enum = _parse_booking_status(created.get("status"))

    reservation_id = str(created.get("reservation_id") or "")
    _persist_reservation_source(reservation_id=reservation_id, source_value="online")
    pricing_signals = _load_pricing_signals(target_date=payload.check_in_date)
    ai_recommendation = _maybe_get_ai_recommendation(
        reservation_id=reservation_id,
        context={
            "check_in_date": payload.check_in_date.isoformat(),
            "check_out_date": payload.check_out_date.isoformat(),
            "total_amount": total_amount,
            "nights": nights,
            "unit_count": len(payload.unit_ids),
            "party_size": payload.guest_count,
            "is_weekend": payload.check_in_date.weekday() >= 5,
            "is_tour": False,
            "occupancy_context": pricing_signals,
        },
    )
    response = ReservationResponse(
        reservation_id=reservation_id,
        reservation_code=str(created.get("reservation_code") or ""),
        status=status_enum,
        **_reservation_policy_fields(created, is_tour=False),
        escrow_ref=_maybe_apply_escrow_shadow_write(reservation_id),
        guest_pass_ref=_schedule_guest_pass_mint(background_tasks, reservation_id),
        ai_recommendation=ai_recommendation,
    )
    _store_reservation_idempotency_receipt(
        route_key="reservations.create",
        user_id=auth.user_id,
        idempotency_key=payload.idempotency_key,
        reservation=response,
    )
    return response


@router.post("/tours", response_model=ReservationResponse)
def create_tour_reservation(
    payload: TourReservationCreateRequest,
    background_tasks: BackgroundTasks,
    auth: AuthContext = Depends(require_authenticated),
):
    if role_at_least(auth.role, "staff") and payload.is_advance:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot create online guest reservations. Use Walk-in flow.",
        )
    replayed = _try_replay_reservation_response(
        route_key="reservations.tours.create",
        user_id=auth.user_id,
        idempotency_key=payload.idempotency_key,
    )
    if replayed:
        return replayed

    _validate_tour_reservation_inputs(
        adult_qty=payload.adult_qty,
        kid_qty=payload.kid_qty,
        visit_date=payload.visit_date,
        auth_role=auth.role,
        is_advance=payload.is_advance,
    )
    service = _get_active_tour_service_or_404(payload.service_id)
    total_amount = _compute_tour_total_amount(
        service=service,
        adult_qty=payload.adult_qty,
        kid_qty=payload.kid_qty,
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
            promo_code=payload.promo_code,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_400_BAD_REQUEST)

    status_enum = _parse_booking_status(created.get("status"))

    reservation_id = str(created.get("reservation_id") or "")
    source_value = _resolve_tour_reservation_source(auth_role=auth.role, is_advance=payload.is_advance)
    _persist_reservation_source(reservation_id=reservation_id, source_value=source_value)
    # Walk-in tours are same-day desk bookings — skip the AI demand recommendation
    # and the 45-day pricing-signals query (a remote AI call + a DB aggregate) so the
    # create returns fast. The demand insight isn't actionable at the counter.
    if source_value == "walk_in":
        ai_recommendation = None
    else:
        pricing_signals = _load_pricing_signals(target_date=payload.visit_date)
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
                "occupancy_context": pricing_signals,
            },
        )
    response = ReservationResponse(
        reservation_id=reservation_id,
        reservation_code=str(created.get("reservation_code") or ""),
        status=status_enum,
        **_reservation_policy_fields(created, is_tour=True),
        escrow_ref=_maybe_apply_escrow_shadow_write(reservation_id),
        guest_pass_ref=_schedule_guest_pass_mint(background_tasks, reservation_id),
        ai_recommendation=ai_recommendation,
    )
    _store_reservation_idempotency_receipt(
        route_key="reservations.tours.create",
        user_id=auth.user_id,
        idempotency_key=payload.idempotency_key,
        reservation=response,
    )
    return response


@router.post("/walk-in", response_model=ReservationResponse)
def create_walk_in_stay_reservation(
    payload: WalkInStayCreateRequest,
    background_tasks: BackgroundTasks,
    auth: AuthContext = Depends(require_operations),
):
    replayed = _try_replay_reservation_response(
        route_key="reservations.walk_in.create",
        user_id=auth.user_id,
        idempotency_key=payload.idempotency_key,
    )
    if replayed:
        return replayed

    _validate_stay_reservation_inputs(
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        unit_ids=payload.unit_ids,
        require_future_check_in=True,
    )
    unit_map = _get_available_unit_map(
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
    )
    _ensure_selected_units_available(unit_ids=payload.unit_ids, unit_map=unit_map)
    # Mirror the guest stay path: enforce capacity and apply pax-based pricing
    # from guest_count so walk-in bookings charge identically to online ones.
    _ensure_guest_count_within_capacity(
        unit_ids=payload.unit_ids,
        unit_map=unit_map,
        guest_count=payload.guest_count,
    )
    nights, rates, total_amount = _compute_stay_rates_and_total(
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        unit_ids=payload.unit_ids,
        unit_map=unit_map,
        guest_count=payload.guest_count,
    )
    notes = _build_walk_in_notes(payload)

    try:
        created = create_reservation_atomic_rpc(
            access_token=auth.access_token,
            guest_user_id=auth.user_id,
            check_in_date=payload.check_in_date.isoformat(),
            check_out_date=payload.check_out_date.isoformat(),
            unit_ids=payload.unit_ids,
            rates=rates,
            total_amount=total_amount,
            expected_pay_now=payload.expected_pay_now,
            notes=notes,
            promo_code=payload.promo_code,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_400_BAD_REQUEST)

    status_enum = _parse_booking_status(created.get("status"))

    reservation_id = str(created.get("reservation_id") or "")
    _persist_reservation_source(reservation_id=reservation_id, source_value="walk_in")
    # Walk-in stays are same-day desk bookings — skip the AI demand recommendation
    # and the 45-day pricing-signals query so the create returns fast. (The walk-in
    # stay screen doesn't surface the demand insight anyway.)
    response = ReservationResponse(
        reservation_id=reservation_id,
        reservation_code=str(created.get("reservation_code") or ""),
        status=status_enum,
        **_reservation_policy_fields(created, is_tour=False),
        escrow_ref=_maybe_apply_escrow_shadow_write(reservation_id),
        guest_pass_ref=_schedule_guest_pass_mint(background_tasks, reservation_id),
        ai_recommendation=None,
    )
    _store_reservation_idempotency_receipt(
        route_key="reservations.walk_in.create",
        user_id=auth.user_id,
        idempotency_key=payload.idempotency_key,
        reservation=response,
    )
    return response


@router.get("", response_model=ReservationListResponse)
def get_reservations(
    limit: int = Query(default=10, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
    source_filter: str | None = Query(default=None, alias="source", pattern="^(online|walk_in)$"),
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
            source_filter=source_filter,
            search=search,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return {
        "items": rows,
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


@router.get("/stats", response_model=ReservationQuickStatsResponse)
def get_reservation_stats(
    today: str | None = Query(
        default=None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Local (resort) date used as 'today'; defaults to PHT.",
    ),
    _auth: AuthContext = Depends(require_admin),
):
    # Resort operates on Philippine time (UTC+8); fall back to that when the
    # client does not supply its own local date.
    resolved_today = today or datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    try:
        return get_reservation_quick_stats(today=resolved_today)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)


@router.get("/by-code/{reservation_code}", response_model=ReservationListItem)
def get_reservation_by_reservation_code(
    reservation_code: str,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        row = get_reservation_by_code(reservation_code)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    ensure_reservation_access(auth, row)
    return row


@router.get("/{reservation_id}", response_model=ReservationAdminDetailItem)
def get_reservation(
    reservation_id: str,
    auth: AuthContext = Depends(require_authenticated),
):
    row = _get_reservation_or_404(reservation_id)
    ensure_reservation_access(auth, row)
    # The on-chain escrow + NFT guest-pass references are crypto internals shown only
    # in the System-Admin "Blockchain / Ledger" panel. A guest may legitimately reach
    # this route for their own booking, so strip those fields for anyone below
    # super_admin (escrow_state stays — it is a plain status the QR gate needs).
    if not role_at_least(auth.role, "super_admin"):
        row = dict(row)
        for field in (
            "chain_key",
            "chain_tx_hash",
            "onchain_booking_id",
            "guest_pass_token_id",
            "guest_pass_tx_hash",
            "guest_pass_reservation_hash",
        ):
            row[field] = None
    return row


@router.patch("/{reservation_id}/status", response_model=ReservationStatusUpdateResponse)
def patch_reservation_status(
    reservation_id: str,
    payload: ReservationStatusUpdateRequest,
    auth: AuthContext = Depends(require_admin),
):
    current = _get_reservation_or_404(reservation_id)

    try:
        updated = update_reservation_status_rpc(
            access_token=auth.access_token,
            reservation_id=reservation_id,
            status=payload.status.value,
            notes=payload.notes,
            include_notes="notes" in payload.model_fields_set,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    if payload.status == BookingStatus.CANCELLED:
        _apply_cancellation_side_effects(
            reservation_id=reservation_id,
            reservation_row=current,
            actor_role="admin",
        )
    elif payload.status == BookingStatus.NO_SHOW:
        _apply_no_show_side_effects(reservation_id=reservation_id, reservation_row=current)

    return {"ok": True, "reservation": updated}


@router.post("/{reservation_id}/cancel", response_model=CancelReservationResponse)
def cancel_reservation(
    reservation_id: str,
    auth: AuthContext = Depends(require_authenticated),
):
    row = _get_reservation_or_404(reservation_id)

    ensure_reservation_access(auth, row)
    _ensure_reservation_cancellable(row)

    try:
        cancel_reservation_rpc(access_token=auth.access_token, reservation_id=reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    decision = _apply_cancellation_side_effects(
        reservation_id=reservation_id,
        reservation_row=row,
        actor_role=auth.role,
    )
    return _build_cancel_response(
        reservation_id=reservation_id,
        reservation_row=row,
        decision=decision,
    )
