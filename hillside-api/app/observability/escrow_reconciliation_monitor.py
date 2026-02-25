from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from threading import Lock
from time import perf_counter
from typing import Any

from app.core.chains import get_active_chain, get_chain_registry
from app.core.config import settings
from app.integrations.escrow_chain import read_escrow_record_onchain
from app.integrations.supabase_client import list_reservations_for_escrow_reconciliation
from app.schemas.common import EscrowReconciliationSummary

logger = logging.getLogger(__name__)


class _MonitorState:
    def __init__(self) -> None:
        self._lock = Lock()
        self._state: dict[str, Any] = {
            "enabled": settings.feature_escrow_reconciliation_scheduler,
            "running": False,
            "interval_sec": settings.escrow_reconciliation_interval_sec,
            "limit": settings.escrow_reconciliation_limit,
            "chain_key": None,
            "last_started_at": None,
            "last_finished_at": None,
            "last_success_at": None,
            "last_duration_ms": None,
            "runs_total": 0,
            "consecutive_failures": 0,
            "last_error": None,
            "last_summary": None,
            "alert_thresholds": {
                "mismatch": settings.escrow_reconciliation_alert_mismatch_threshold,
                "missing_onchain": settings.escrow_reconciliation_alert_missing_onchain_threshold,
                "skipped": settings.escrow_reconciliation_alert_skipped_threshold,
            },
            "alert_active": False,
        }

    def begin_run(self, chain_key: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            self._state["running"] = True
            self._state["chain_key"] = chain_key
            self._state["last_started_at"] = now
            self._state["last_error"] = None

    def complete_success(self, *, duration_ms: float, summary: EscrowReconciliationSummary) -> None:
        now = datetime.now(timezone.utc).isoformat()
        thresholds = self._state["alert_thresholds"]
        alert_active = (
            summary.mismatch >= int(thresholds["mismatch"])
            or summary.missing_onchain >= int(thresholds["missing_onchain"])
            or summary.skipped >= int(thresholds["skipped"])
        )
        with self._lock:
            self._state["running"] = False
            self._state["last_finished_at"] = now
            self._state["last_success_at"] = now
            self._state["last_duration_ms"] = round(duration_ms, 2)
            self._state["runs_total"] = int(self._state["runs_total"]) + 1
            self._state["consecutive_failures"] = 0
            self._state["last_summary"] = summary.model_dump()
            self._state["alert_active"] = alert_active
            self._state["last_error"] = None

    def complete_failure(self, *, duration_ms: float, error: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            self._state["running"] = False
            self._state["last_finished_at"] = now
            self._state["last_duration_ms"] = round(duration_ms, 2)
            self._state["runs_total"] = int(self._state["runs_total"]) + 1
            self._state["consecutive_failures"] = int(self._state["consecutive_failures"]) + 1
            self._state["last_error"] = error
            self._state["alert_active"] = True

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._state)


_monitor_state = _MonitorState()


def _resolve_chain_key() -> str:
    configured = (settings.escrow_reconciliation_chain_key or "").strip().lower()
    return configured or get_active_chain().key


def _build_summary(chain_key: str, limit: int) -> EscrowReconciliationSummary:
    registry = get_chain_registry()
    if chain_key not in registry:
        raise RuntimeError(f"Unsupported chain_key '{chain_key}' for reconciliation scheduler.")
    chain = registry[chain_key]
    if not chain.enabled:
        raise RuntimeError(f"Chain '{chain_key}' is disabled.")

    rows, total = list_reservations_for_escrow_reconciliation(chain_key=chain_key, limit=limit, offset=0)
    summary = EscrowReconciliationSummary(total=total)
    for row in rows:
        reservation_id = str(row.get("reservation_id") or "")
        try:
            onchain = read_escrow_record_onchain(
                chain=chain,
                reservation_id=reservation_id,
                onchain_booking_id=row.get("onchain_booking_id"),
            )
            onchain_state = onchain.state
        except RuntimeError:
            summary.skipped += 1
            continue

        db_state = str(row.get("escrow_state") or "none")
        if onchain_state == "none":
            summary.missing_onchain += 1
        elif db_state == onchain_state:
            summary.match += 1
        else:
            summary.mismatch += 1

    summary.alert = (summary.mismatch + summary.missing_onchain) > 0
    return summary


def run_escrow_reconciliation_once_now() -> dict[str, Any]:
    chain_key = _resolve_chain_key()
    limit = settings.escrow_reconciliation_limit
    _monitor_state.begin_run(chain_key)
    start = perf_counter()
    try:
        summary = _build_summary(chain_key=chain_key, limit=limit)
        _monitor_state.complete_success(duration_ms=(perf_counter() - start) * 1000, summary=summary)
        snapshot = _monitor_state.snapshot()
        if snapshot.get("alert_active"):
            logger.warning(
                "Escrow reconciliation alert active: chain=%s summary=%s",
                chain_key,
                summary.model_dump(),
            )
        else:
            logger.info("Escrow reconciliation run ok: chain=%s summary=%s", chain_key, summary.model_dump())
        return snapshot
    except Exception as exc:  # noqa: BLE001
        _monitor_state.complete_failure(duration_ms=(perf_counter() - start) * 1000, error=str(exc))
        logger.exception("Escrow reconciliation run failed: chain=%s", chain_key)
        return _monitor_state.snapshot()


def get_escrow_reconciliation_monitor_snapshot() -> dict[str, Any]:
    return _monitor_state.snapshot()


async def escrow_reconciliation_scheduler_loop() -> None:
    interval = max(30, int(settings.escrow_reconciliation_interval_sec))
    logger.info("Escrow reconciliation scheduler started (interval_sec=%s)", interval)
    try:
        while True:
            await asyncio.to_thread(run_escrow_reconciliation_once_now)
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        logger.info("Escrow reconciliation scheduler stopped")
        raise
