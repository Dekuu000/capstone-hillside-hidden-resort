from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from threading import Lock, Thread
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter
from typing import Any

from app.core.chains import get_active_chain, get_chain_registry
from app.core.config import settings
from app.integrations.escrow_chain import read_escrow_record_onchain
from app.integrations.supabase_client import list_reservations_for_escrow_reconciliation
from app.services.escrow_release_retry import retry_pending_release_batch
from app.schemas.common import EscrowReconciliationSummary

logger = logging.getLogger(__name__)


class _MonitorState:
    def __init__(self) -> None:
        self._lock = Lock()
        self._cached_chain_key: str | None = None
        self._cached_items: list[dict[str, Any]] = []
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

    def complete_success(
        self,
        *,
        chain_key: str,
        duration_ms: float,
        summary: EscrowReconciliationSummary,
        items: list[dict[str, Any]],
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        thresholds = self._state["alert_thresholds"]
        alert_active = (
            summary.mismatch >= int(thresholds["mismatch"])
            or summary.missing_onchain >= int(thresholds["missing_onchain"])
            or summary.skipped >= int(thresholds["skipped"])
        )
        with self._lock:
            self._cached_chain_key = chain_key
            self._cached_items = list(items)
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

    def get_cached_page(
        self,
        *,
        chain_key: str,
        limit: int,
        offset: int,
    ) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        with self._lock:
            if self._cached_chain_key != chain_key:
                return [], None
            snapshot = dict(self._state)
            items = self._cached_items[offset : offset + limit]
            return items, snapshot


_monitor_state = _MonitorState()


def _resolve_chain_key() -> str:
    configured = (settings.escrow_reconciliation_chain_key or "").strip().lower()
    return configured or get_active_chain().key


def _build_reconciliation_snapshot(
    chain_key: str, limit: int
) -> tuple[list[dict[str, Any]], EscrowReconciliationSummary]:
    registry = get_chain_registry()
    if chain_key not in registry:
        raise RuntimeError(f"Unsupported chain_key '{chain_key}' for reconciliation scheduler.")
    chain = registry[chain_key]
    if not chain.enabled:
        raise RuntimeError(f"Chain '{chain_key}' is disabled.")

    rows, total = list_reservations_for_escrow_reconciliation(chain_key=chain_key, limit=limit, offset=0)
    summary = EscrowReconciliationSummary(total=total)
    if not rows:
        return [], summary

    def _reconcile_row(row: dict[str, Any]) -> dict[str, Any]:
        reservation_id = str(row.get("reservation_id") or "")
        reservation_code = str(row.get("reservation_code") or "")
        db_state = str(row.get("escrow_state") or "none")
        db_onchain_booking_id = row.get("onchain_booking_id")
        db_chain_tx_hash = row.get("chain_tx_hash")
        if db_state == "pending_lock" and not db_onchain_booking_id and not db_chain_tx_hash:
            return {
                "reservation_id": reservation_id,
                "reservation_code": reservation_code,
                "db_escrow_state": db_state,
                "chain_key": row.get("chain_key"),
                "chain_id": row.get("chain_id"),
                "chain_tx_hash": None,
                "onchain_booking_id": None,
                "onchain_state": None,
                "onchain_amount_wei": None,
                "reservation_updated_at": row.get("updated_at") or row.get("created_at"),
                "result": "skipped",
                "reason": "Pending lock without booking id/tx hash; skipped on-chain lookup.",
            }

        try:
            onchain = read_escrow_record_onchain(
                chain=chain,
                reservation_id=reservation_id,
                onchain_booking_id=row.get("onchain_booking_id"),
            )
            onchain_state = onchain.state
            onchain_amount_wei = str(onchain.amount_wei)
        except RuntimeError as exc:
            return {
                "reservation_id": reservation_id,
                "reservation_code": reservation_code,
                "db_escrow_state": db_state,
                "chain_key": row.get("chain_key"),
                "chain_id": row.get("chain_id"),
                "chain_tx_hash": db_chain_tx_hash,
                "onchain_booking_id": str(db_onchain_booking_id) if db_onchain_booking_id else None,
                "onchain_state": None,
                "onchain_amount_wei": None,
                "reservation_updated_at": row.get("updated_at") or row.get("created_at"),
                "result": "skipped",
                "reason": str(exc),
            }

        if onchain_state == "none":
            result = "missing_onchain"
            reason = "No escrow record found on-chain for booking id."
        elif db_state == onchain_state:
            result = "match"
            reason = None
        else:
            result = "mismatch"
            reason = f"DB escrow_state='{db_state}' differs from on-chain state='{onchain_state}'."

        return {
            "reservation_id": reservation_id,
            "reservation_code": reservation_code,
            "db_escrow_state": db_state,
            "chain_key": row.get("chain_key"),
            "chain_id": row.get("chain_id"),
            "chain_tx_hash": db_chain_tx_hash,
            "onchain_booking_id": str(db_onchain_booking_id) if db_onchain_booking_id else onchain.booking_id,
            "onchain_state": onchain_state,
            "onchain_amount_wei": onchain_amount_wei,
            "reservation_updated_at": row.get("updated_at") or row.get("created_at"),
            "result": result,
            "reason": reason,
        }

    worker_count = min(8, len(rows))
    with ThreadPoolExecutor(max_workers=worker_count) as pool:
        items = list(pool.map(_reconcile_row, rows))

    for item in items:
        result = item.get("result")
        if result == "match":
            summary.match += 1
        elif result == "mismatch":
            summary.mismatch += 1
        elif result == "missing_onchain":
            summary.missing_onchain += 1
        elif result == "skipped":
            summary.skipped += 1

    summary.alert = (summary.mismatch + summary.missing_onchain) > 0
    return items, summary


def run_escrow_reconciliation_once_now() -> dict[str, Any]:
    chain_key = _resolve_chain_key()
    limit = settings.escrow_reconciliation_limit
    _monitor_state.begin_run(chain_key)
    start = perf_counter()
    try:
        items, summary = _build_reconciliation_snapshot(chain_key=chain_key, limit=limit)
        _monitor_state.complete_success(
            chain_key=chain_key,
            duration_ms=(perf_counter() - start) * 1000,
            summary=summary,
            items=items,
        )
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


def get_cached_escrow_reconciliation_page(
    *,
    chain_key: str,
    limit: int,
    offset: int,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    return _monitor_state.get_cached_page(chain_key=chain_key, limit=limit, offset=offset)


def kickoff_escrow_reconciliation_run() -> bool:
    snapshot = _monitor_state.snapshot()
    if bool(snapshot.get("running")):
        return False
    Thread(target=run_escrow_reconciliation_once_now, daemon=True).start()
    return True


async def escrow_reconciliation_scheduler_loop() -> None:
    interval = max(30, int(settings.escrow_reconciliation_interval_sec))
    retry_interval = max(30, int(settings.escrow_release_retry_interval_sec))
    last_retry_at = 0.0
    logger.info(
        "Escrow reconciliation scheduler started (interval_sec=%s, release_retry_interval_sec=%s)",
        interval,
        retry_interval,
    )
    try:
        while True:
            if settings.feature_escrow_onchain_lock and (perf_counter() - last_retry_at) >= retry_interval:
                try:
                    retry_results = await asyncio.to_thread(
                        retry_pending_release_batch,
                        chain_key=_resolve_chain_key(),
                        limit=max(1, int(settings.escrow_release_retry_batch_size)),
                    )
                    pending_after = sum(1 for row in retry_results if str(row.get("escrow_state")) == "pending_release")
                    released_count = sum(1 for row in retry_results if str(row.get("escrow_state")) == "released")
                    if retry_results:
                        logger.info(
                            "Escrow release retry pass complete: total=%s released=%s pending=%s",
                            len(retry_results),
                            released_count,
                            pending_after,
                        )
                except Exception:  # noqa: BLE001
                    logger.exception("Escrow release retry pass failed before reconciliation run.")
                finally:
                    last_retry_at = perf_counter()
            await asyncio.to_thread(run_escrow_reconciliation_once_now)
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        logger.info("Escrow reconciliation scheduler stopped")
        raise
