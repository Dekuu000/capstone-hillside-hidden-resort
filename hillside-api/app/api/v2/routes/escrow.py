from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_admin
from app.core.chains import get_active_chain, get_chain_registry
from app.core.config import settings
from app.integrations.escrow_chain import read_escrow_record_onchain
from app.observability.escrow_reconciliation_monitor import (
    get_escrow_reconciliation_monitor_snapshot,
    run_escrow_reconciliation_once_now,
)
from app.integrations.supabase_client import (
    clear_reservation_shadow_escrow_metadata,
    list_reservations_for_escrow_reconciliation,
    list_reservations_for_shadow_cleanup,
)
from app.schemas.common import (
    EscrowReconciliationMonitorResponse,
    EscrowShadowCleanupRequest,
    EscrowShadowCleanupResponse,
    EscrowReconciliationItem,
    EscrowReconciliationResponse,
    EscrowReconciliationSummary,
)

router = APIRouter()


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
    chain = registry[resolved_key]
    if not chain.enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chain '{resolved_key}' is disabled.",
        )

    try:
        rows, total = list_reservations_for_escrow_reconciliation(
            chain_key=resolved_key,
            limit=limit,
            offset=offset,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    items: list[EscrowReconciliationItem] = []
    summary = EscrowReconciliationSummary(total=total)
    for row in rows:
        reservation_id = str(row.get("reservation_id") or "")
        reservation_code = str(row.get("reservation_code") or "")
        db_state = str(row.get("escrow_state") or "none")
        db_onchain_booking_id = row.get("onchain_booking_id")
        db_chain_tx_hash = row.get("chain_tx_hash")

        try:
            onchain = read_escrow_record_onchain(
                chain=chain,
                reservation_id=reservation_id,
                onchain_booking_id=db_onchain_booking_id,
            )
            onchain_state = onchain.state
            onchain_amount_wei = str(onchain.amount_wei)
        except RuntimeError as exc:
            items.append(
                EscrowReconciliationItem(
                    reservation_id=reservation_id,
                    reservation_code=reservation_code,
                    db_escrow_state=db_state,
                    chain_key=row.get("chain_key"),
                    chain_id=row.get("chain_id"),
                    chain_tx_hash=db_chain_tx_hash,
                    onchain_booking_id=str(db_onchain_booking_id) if db_onchain_booking_id else None,
                    onchain_state=None,
                    onchain_amount_wei=None,
                    result="skipped",
                    reason=str(exc),
                )
            )
            summary.skipped += 1
            continue

        if onchain_state == "none":
            result = "missing_onchain"
            reason = "No escrow record found on-chain for booking id."
            summary.missing_onchain += 1
        elif db_state == onchain_state:
            result = "match"
            reason = None
            summary.match += 1
        else:
            result = "mismatch"
            reason = f"DB escrow_state='{db_state}' differs from on-chain state='{onchain_state}'."
            summary.mismatch += 1

        items.append(
            EscrowReconciliationItem(
                reservation_id=reservation_id,
                reservation_code=reservation_code,
                db_escrow_state=db_state,
                chain_key=row.get("chain_key"),
                chain_id=row.get("chain_id"),
                chain_tx_hash=db_chain_tx_hash,
                onchain_booking_id=str(db_onchain_booking_id) if db_onchain_booking_id else onchain.booking_id,
                onchain_state=onchain_state,  # type: ignore[arg-type]
                onchain_amount_wei=onchain_amount_wei,
                result=result,  # type: ignore[arg-type]
                reason=reason,
            )
        )

    return EscrowReconciliationResponse(
        items=items,
        count=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(items) < total,
        summary=EscrowReconciliationSummary(
            total=summary.total,
            match=summary.match,
            mismatch=summary.mismatch,
            missing_onchain=summary.missing_onchain,
            skipped=summary.skipped,
            alert=(summary.mismatch + summary.missing_onchain) > 0,
        ),
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
