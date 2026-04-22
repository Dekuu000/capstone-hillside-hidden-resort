from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_admin
from app.core.cache import TTLCache
from app.core.chains import get_active_chain
from app.core.config import settings
from app.integrations.supabase_client import (
    get_latest_ai_occupancy_forecast_any,
    get_report_summary as get_report_summary_rpc,
    list_admin_payments,
    list_recent_reservations,
    list_units_admin,
)
from app.observability.escrow_reconciliation_monitor import get_cached_escrow_reconciliation_page
from app.observability.perf_metrics import perf_metrics
from app.schemas.common import DashboardSummaryResponse, ResortSnapshotResponse

router = APIRouter()
_CACHE = TTLCache(settings.cache_ttl_seconds)
_WEI_PER_ETH = Decimal("1000000000000000000")
_STALE_FORECAST_HOURS = 24


def _to_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _to_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _resolve_crypto_snapshot() -> tuple[float, int, str]:
    chain_key = (settings.escrow_reconciliation_chain_key or get_active_chain().key).lower()
    limit = max(20, int(settings.escrow_reconciliation_limit))
    items, _snapshot = get_cached_escrow_reconciliation_page(chain_key=chain_key, limit=limit, offset=0)
    if not items:
        return 0.0, 0, chain_key

    total_wei = Decimal("0")
    tx_count = 0
    for item in items:
        if item.get("chain_tx_hash"):
            tx_count += 1
        wei_raw = item.get("onchain_amount_wei")
        if wei_raw is None:
            continue
        try:
            amount_wei = Decimal(str(wei_raw))
        except (InvalidOperation, TypeError, ValueError):
            continue
        if amount_wei > 0:
            total_wei += amount_wei

    total_eth = total_wei / _WEI_PER_ETH
    return round(float(total_eth), 6), tx_count, chain_key


def _resolve_ai_demand_snapshot() -> dict:
    forecast_row = get_latest_ai_occupancy_forecast_any()
    if not forecast_row:
        return {
            "status": "missing",
            "model_version": None,
            "avg_occupancy_pct": 0,
            "peak_occupancy_pct": 0,
            "peak_date": None,
            "items": [],
        }

    raw_series = forecast_row.get("series")
    series = raw_series if isinstance(raw_series, list) else []
    today = date.today()
    items: list[dict] = []
    for row in series:
        if not isinstance(row, dict):
            continue
        raw_date = str(row.get("date") or "").strip()
        try:
            day = date.fromisoformat(raw_date)
        except ValueError:
            continue
        if day < today:
            continue
        occupancy_ratio = _to_float(row.get("occupancy"))
        occupancy_pct = max(0, min(100, round(occupancy_ratio * 100)))
        items.append({"date": day.isoformat(), "occupancy_pct": int(occupancy_pct)})

    items.sort(key=lambda item: item["date"])
    items = items[:7]
    if not items:
        return {
            "status": "missing",
            "model_version": str(forecast_row.get("model_version") or "unknown"),
            "avg_occupancy_pct": 0,
            "peak_occupancy_pct": 0,
            "peak_date": None,
            "items": [],
        }

    avg_pct = round(sum(item["occupancy_pct"] for item in items) / len(items))
    peak = max(items, key=lambda item: item["occupancy_pct"])
    generated_at = _to_datetime(forecast_row.get("generated_at") or forecast_row.get("created_at"))
    stale = True
    if generated_at is not None:
        stale = (datetime.now(timezone.utc) - generated_at) > timedelta(hours=_STALE_FORECAST_HOURS)

    return {
        "status": "stale" if stale else "ready",
        "model_version": str(forecast_row.get("model_version") or "unknown"),
        "avg_occupancy_pct": int(avg_pct),
        "peak_occupancy_pct": int(peak["occupancy_pct"]),
        "peak_date": peak["date"],
        "items": items,
    }


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    auth: AuthContext = Depends(require_admin),
):
    to_value = to_date or date.today()
    from_value = from_date or (to_value - timedelta(days=7))

    if to_value < from_value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="to_date must be on or after from_date.",
        )

    range_days = (to_value - from_value).days
    if range_days > 366:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Date range cannot exceed 366 days.",
        )

    cache_key = f"dashboard:summary:{auth.user_id}:{from_value.isoformat()}:{to_value.isoformat()}"
    cached = _CACHE.get(cache_key)
    if cached:
        return cached

    try:
        _, active_units_count = list_units_admin(limit=1, offset=0, is_active=True)
        _, for_verification_count = list_recent_reservations(limit=1, offset=0, status_filter="for_verification")
        _, confirmed_count = list_recent_reservations(limit=1, offset=0, status_filter="confirmed")
        _, pending_payments_count = list_admin_payments(tab="to_review", limit=1, offset=0)
        summary_row = get_report_summary_rpc(
            access_token=auth.access_token,
            start_date=from_value.isoformat(),
            end_date=to_value.isoformat(),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    payload = {
        "from_date": from_value.isoformat(),
        "to_date": to_value.isoformat(),
        "metrics": {
            "active_units": active_units_count,
            "for_verification": for_verification_count,
            "pending_payments": pending_payments_count,
            "confirmed": confirmed_count,
        },
        "summary": {
            "bookings": _to_int(summary_row.get("bookings")),
            "cancellations": _to_int(summary_row.get("cancellations")),
            "cash_collected": _to_float(summary_row.get("cash_collected")),
            "occupancy_rate": _to_float(summary_row.get("occupancy_rate")),
            "unit_booked_value": _to_float(summary_row.get("unit_booked_value")),
            "tour_booked_value": _to_float(summary_row.get("tour_booked_value")),
        },
    }
    _CACHE.set(cache_key, payload)
    return payload


@router.get("/resort-snapshot", response_model=ResortSnapshotResponse)
def get_resort_snapshot(
    auth: AuthContext = Depends(require_admin),
):
    cache_key = f"dashboard:resort-snapshot:{auth.user_id}"
    cached = _CACHE.get(cache_key)
    if cached:
        return cached

    end_date = date.today()
    start_date = end_date - timedelta(days=6)

    try:
        _, active_units_count = list_units_admin(limit=1, offset=0, is_active=True)
        _, occupied_units_count = list_units_admin(
            limit=1,
            offset=0,
            is_active=True,
            operational_status="occupied",
        )
        summary_row = get_report_summary_rpc(
            access_token=auth.access_token,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
        )
        crypto_total, crypto_tx_count, chain_key = _resolve_crypto_snapshot()
        ai_demand = _resolve_ai_demand_snapshot()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    occupancy_rate = 0.0
    if active_units_count > 0:
        occupancy_rate = max(0.0, min(1.0, occupied_units_count / active_units_count))

    payload = {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "occupancy": {
            "occupied_units": occupied_units_count,
            "active_units": active_units_count,
            "occupancy_rate": occupancy_rate,
        },
        "revenue": {
            "fiat_php_7d": _to_float(summary_row.get("cash_collected")),
            "crypto_native_total": crypto_total,
            "crypto_tx_count": crypto_tx_count,
            "crypto_chain_key": chain_key,
            "crypto_unit": "ETH",
        },
        "ai_demand_7d": ai_demand,
    }
    _CACHE.set(cache_key, payload)
    return payload


@router.get("/perf")
def get_dashboard_performance_snapshot(
    _: AuthContext = Depends(require_admin),
):
    return perf_metrics.snapshot()
