from datetime import datetime, timedelta, timezone
from typing import Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_admin
from app.core.cache import TTLCache
from app.core.chains import get_active_chain, get_chain_registry
from app.core.config import settings
from app.integrations.escrow_chain import read_chain_gas_snapshot, read_escrow_record_onchain
from app.observability.escrow_reconciliation_monitor import (
    get_cached_escrow_reconciliation_page,
    get_escrow_reconciliation_monitor_snapshot,
    kickoff_escrow_reconciliation_run,
    run_escrow_reconciliation_once_now,
)
from app.integrations.supabase_client import (
    clear_reservation_shadow_escrow_metadata,
    get_reservation_by_id,
    list_escrow_contract_status_rows,
    list_reservations_for_escrow_reconciliation,
    list_reservations_for_shadow_cleanup,
)
from app.services.escrow_release_retry import retry_release_for_reservation_row
from app.schemas.common import (
    ContractStatusGasSnapshot,
    ContractStatusResponse,
    ContractStatusTxItem,
    EscrowReleaseRetryRequest,
    EscrowReleaseRetryResponse,
    EscrowReconciliationMonitorResponse,
    EscrowShadowCleanupRequest,
    EscrowShadowCleanupResponse,
    EscrowReconciliationItem,
    EscrowReconciliationResponse,
    EscrowReconciliationSummary,
)

router = APIRouter()
_CONTRACT_STATUS_CACHE = TTLCache(30)
_CONTRACT_STATUS_GAS_CACHE = TTLCache(300)


def _build_reconciliation_page_live(
    *,
    chain,
    chain_key: str,
    limit: int,
    offset: int,
) -> tuple[list[EscrowReconciliationItem], int, EscrowReconciliationSummary]:
    rows, total = list_reservations_for_escrow_reconciliation(
        chain_key=chain_key,
        limit=limit,
        offset=offset,
    )
    summary = EscrowReconciliationSummary(total=total)
    items: list[EscrowReconciliationItem] = []
    allowed_states = {"none", "locked", "released", "refunded"}

    for row in rows:
        reservation_id = str(row.get("reservation_id") or "")
        reservation_code = str(row.get("reservation_code") or "")
        db_state = str(row.get("escrow_state") or "none")
        db_onchain_booking_id = row.get("onchain_booking_id")
        db_chain_tx_hash = row.get("chain_tx_hash")
        reservation_updated_at = row.get("updated_at") or row.get("created_at")

        if db_state == "pending_lock" and not db_onchain_booking_id and not db_chain_tx_hash:
            item = EscrowReconciliationItem(
                reservation_id=reservation_id,
                reservation_code=reservation_code,
                db_escrow_state=db_state,
                chain_key=row.get("chain_key"),
                chain_id=row.get("chain_id"),
                chain_tx_hash=None,
                onchain_booking_id=None,
                onchain_state=None,
                onchain_amount_wei=None,
                reservation_updated_at=reservation_updated_at,
                result="skipped",
                reason="Pending lock without booking id/tx hash; skipped on-chain lookup.",
            )
        else:
            try:
                onchain = read_escrow_record_onchain(
                    chain=chain,
                    reservation_id=reservation_id,
                    onchain_booking_id=db_onchain_booking_id,
                )
                onchain_state_raw = str(onchain.state or "none")
                onchain_state = onchain_state_raw if onchain_state_raw in allowed_states else "none"
                onchain_amount_wei = str(onchain.amount_wei)
            except RuntimeError as exc:
                item = EscrowReconciliationItem(
                    reservation_id=reservation_id,
                    reservation_code=reservation_code,
                    db_escrow_state=db_state,
                    chain_key=row.get("chain_key"),
                    chain_id=row.get("chain_id"),
                    chain_tx_hash=db_chain_tx_hash,
                    onchain_booking_id=str(db_onchain_booking_id) if db_onchain_booking_id else None,
                    onchain_state=None,
                    onchain_amount_wei=None,
                    reservation_updated_at=reservation_updated_at,
                    result="skipped",
                    reason=str(exc),
                )
            else:
                if onchain_state == "none":
                    result = "missing_onchain"
                    reason = "No escrow record found on-chain for booking id."
                elif db_state == onchain_state:
                    result = "match"
                    reason = None
                else:
                    result = "mismatch"
                    reason = f"DB escrow_state='{db_state}' differs from on-chain state='{onchain_state}'."

                item = EscrowReconciliationItem(
                    reservation_id=reservation_id,
                    reservation_code=reservation_code,
                    db_escrow_state=db_state,
                    chain_key=row.get("chain_key"),
                    chain_id=row.get("chain_id"),
                    chain_tx_hash=db_chain_tx_hash,
                    onchain_booking_id=str(db_onchain_booking_id) if db_onchain_booking_id else onchain.booking_id,
                    onchain_state=cast(Literal["none", "locked", "released", "refunded"] | None, onchain_state),
                    onchain_amount_wei=onchain_amount_wei,
                    reservation_updated_at=reservation_updated_at,
                    result=cast(Literal["match", "mismatch", "missing_onchain", "skipped"], result),
                    reason=reason,
                )

        if item.result == "match":
            summary.match += 1
        elif item.result == "mismatch":
            summary.mismatch += 1
        elif item.result == "missing_onchain":
            summary.missing_onchain += 1
        elif item.result == "skipped":
            summary.skipped += 1

        items.append(item)

    summary.alert = (summary.mismatch + summary.missing_onchain) > 0
    return items, total, summary


def _normalize_contract_status_state(raw: object) -> str:
    value = str(raw or "").strip().lower()
    allowed = {"locked", "released", "refunded", "pending_lock", "pending_release", "failed"}
    return value if value in allowed else "failed"


@router.get("/reconciliation", response_model=EscrowReconciliationResponse)
def get_escrow_reconciliation(
    chain_key: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _auth: AuthContext = Depends(require_admin),
):
    registry = get_chain_registry()
    active_chain = get_active_chain()
    resolved_key = (chain_key or active_chain.key).lower()

    if resolved_key not in registry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported chain_key '{resolved_key}'.",
        )
    if not registry[resolved_key].enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chain '{resolved_key}' is disabled.",
        )

    cached_items_raw, monitor_snapshot = get_cached_escrow_reconciliation_page(
        chain_key=resolved_key,
        limit=limit,
        offset=offset,
    )
    if monitor_snapshot is None:
        # Backward-compatible synchronous fallback for environments where the
        # scheduler has not produced an initial snapshot yet.
        try:
            items, total, summary = _build_reconciliation_page_live(
                chain=registry[resolved_key],
                chain_key=resolved_key,
                limit=limit,
                offset=offset,
            )
            return EscrowReconciliationResponse(
                items=items,
                count=total,
                limit=limit,
                offset=offset,
                has_more=offset + len(items) < total,
                summary=summary,
                cached=False,
                in_progress=False,
                last_reconciled_at=datetime.now(timezone.utc),
            )
        except RuntimeError:
            kickoff_escrow_reconciliation_run()
            return EscrowReconciliationResponse(
                items=[],
                count=0,
                limit=limit,
                offset=offset,
                has_more=False,
                summary=EscrowReconciliationSummary(),
                cached=False,
                in_progress=True,
                last_reconciled_at=None,
            )

    summary_raw = monitor_snapshot.get("last_summary") or {}
    summary = EscrowReconciliationSummary.model_validate(summary_raw)
    items = [EscrowReconciliationItem.model_validate(item) for item in cached_items_raw]
    if not items and not bool(monitor_snapshot.get("running")):
        kickoff_escrow_reconciliation_run()

    return EscrowReconciliationResponse(
        items=items,
        count=summary.total,
        limit=limit,
        offset=offset,
        has_more=offset + len(items) < summary.total,
        summary=summary,
        cached=True,
        in_progress=bool(monitor_snapshot.get("running")),
        last_reconciled_at=monitor_snapshot.get("last_success_at"),
    )


@router.post("/cleanup-shadow", response_model=EscrowShadowCleanupResponse)
def cleanup_shadow_rows(
    payload: EscrowShadowCleanupRequest,
    _auth: AuthContext = Depends(require_admin),
):
    registry = get_chain_registry()
    active_chain = get_active_chain()
    resolved_key = (payload.chain_key or active_chain.key).lower()

    if resolved_key not in registry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported chain_key '{resolved_key}'.",
        )

    try:
        candidates = list_reservations_for_shadow_cleanup(
            chain_key=resolved_key,
            limit=payload.limit,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    cleaned_ids: list[str] = []
    if payload.execute:
        for row in candidates:
            reservation_id = str(row.get("reservation_id") or "")
            tx_hash = str(row.get("chain_tx_hash") or "")
            if not reservation_id or not tx_hash:
                continue
            try:
                cleaned = clear_reservation_shadow_escrow_metadata(
                    reservation_id=reservation_id,
                    chain_key=resolved_key,
                    expected_tx_hash=tx_hash,
                )
            except RuntimeError:
                cleaned = False
            if cleaned:
                cleaned_ids.append(reservation_id)

    return EscrowShadowCleanupResponse(
        chain_key=resolved_key,
        executed=payload.execute,
        candidate_count=len(candidates),
        cleaned_count=len(cleaned_ids),
        cleaned_reservation_ids=cleaned_ids,
        candidates=candidates,
    )


@router.get("/contract-status", response_model=ContractStatusResponse)
def get_contract_status(
    chain_key: str | None = Query(default=None),
    window_days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _auth: AuthContext = Depends(require_admin),
):
    registry = get_chain_registry()
    active_chain = get_active_chain()
    resolved_key = (chain_key or active_chain.key).lower()
    chain = registry.get(resolved_key)
    if not chain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported chain_key '{resolved_key}'.",
        )
    if not chain.enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chain '{resolved_key}' is disabled.",
        )

    cache_key = f"escrow:contract-status:{resolved_key}:{window_days}:{limit}:{offset}"
    cached_payload = _CONTRACT_STATUS_CACHE.get(cache_key)
    if cached_payload:
        return cached_payload

    now_utc = datetime.now(timezone.utc)
    from_ts = (now_utc - timedelta(days=window_days)).isoformat()

    try:
        recent_rows, successful_count, pending_count = list_escrow_contract_status_rows(
            chain_key=resolved_key,
            from_ts=from_ts,
            limit=limit,
            offset=offset,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    gas_snapshot_raw = read_chain_gas_snapshot(chain)
    gas_cache_key = f"escrow:contract-status:gas:{resolved_key}"

    if gas_snapshot_raw.get("source") == "live":
        _CONTRACT_STATUS_GAS_CACHE.set(gas_cache_key, gas_snapshot_raw)
    elif gas_snapshot_raw.get("source") == "unavailable":
        cached_gas = _CONTRACT_STATUS_GAS_CACHE.get(gas_cache_key)
        if isinstance(cached_gas, dict):
            gas_snapshot_raw = {
                **cached_gas,
                "source": "cached",
                "stale": True,
                "note": gas_snapshot_raw.get("note") or "Live gas unavailable; using cached snapshot.",
            }

    gas_snapshot = ContractStatusGasSnapshot.model_validate(gas_snapshot_raw)
    recent_items = [
        ContractStatusTxItem(
            reservation_id=str(row.get("reservation_id") or ""),
            reservation_code=str(row.get("reservation_code") or row.get("reservation_id") or "unknown"),
            escrow_state=cast(
                Literal["locked", "released", "refunded", "pending_lock", "pending_release", "failed"],
                _normalize_contract_status_state(row.get("escrow_state")),
            ),
            chain_tx_hash=str(row.get("chain_tx_hash") or "unknown"),
            onchain_booking_id=row.get("onchain_booking_id"),
            updated_at=row.get("updated_at") or row.get("created_at"),
        )
        for row in recent_rows
    ]

    payload = ContractStatusResponse(
        as_of=now_utc,
        chain_key=cast(Literal["sepolia", "amoy"], resolved_key),
        enabled_chain_keys=[
            cast(Literal["sepolia", "amoy"], key)
            for key, cfg in registry.items()
            if cfg.enabled
        ],
        chain_id=int(chain.chain_id),
        contract_address=(chain.escrow_contract_address or None),
        explorer_base_url=chain.explorer_base_url or "",
        window_days=window_days,
        gas=gas_snapshot,
        successful_tx_count=successful_count,
        pending_escrows_count=pending_count,
        count=successful_count,
        limit=limit,
        offset=offset,
        has_more=offset + len(recent_items) < successful_count,
        recent_successful_txs=recent_items,
    )
    _CONTRACT_STATUS_CACHE.set(cache_key, payload.model_dump())
    return payload


@router.get("/reconciliation-monitor", response_model=EscrowReconciliationMonitorResponse)
def get_reconciliation_monitor(
    _auth: AuthContext = Depends(require_admin),
):
    snapshot = get_escrow_reconciliation_monitor_snapshot()
    snapshot["enabled"] = settings.feature_escrow_reconciliation_scheduler
    return EscrowReconciliationMonitorResponse.model_validate(snapshot)


@router.post("/reconciliation-monitor/run", response_model=EscrowReconciliationMonitorResponse)
def run_reconciliation_monitor_now(
    _auth: AuthContext = Depends(require_admin),
):
    snapshot = run_escrow_reconciliation_once_now()
    snapshot["enabled"] = settings.feature_escrow_reconciliation_scheduler
    return EscrowReconciliationMonitorResponse.model_validate(snapshot)


@router.post("/release-retry", response_model=EscrowReleaseRetryResponse)
def retry_escrow_release(
    payload: EscrowReleaseRetryRequest,
    _auth: AuthContext = Depends(require_admin),
):
    try:
        row = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    try:
        retry_result = retry_release_for_reservation_row(row)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return EscrowReleaseRetryResponse(
        ok=bool(retry_result.get("ok", False)),
        reservation_id=str(retry_result.get("reservation_id") or payload.reservation_id),
        escrow_state=cast(
            Literal["released", "pending_release", "locked", "skipped"],
            str(retry_result.get("escrow_state") or "skipped"),
        ),
        tx_hash=str(retry_result.get("tx_hash") or "").strip() or None,
        message=str(retry_result.get("message") or "").strip() or None,
    )
