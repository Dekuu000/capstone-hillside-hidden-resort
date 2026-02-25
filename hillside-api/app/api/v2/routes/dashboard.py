from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_admin
from app.integrations.supabase_client import (
    get_report_summary as get_report_summary_rpc,
    list_admin_payments,
    list_recent_reservations,
    list_units_admin,
)
from app.observability.perf_metrics import perf_metrics
from app.schemas.common import DashboardSummaryResponse

router = APIRouter()


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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="to_date must be on or after from_date.",
        )

    range_days = (to_value - from_value).days
    if range_days > 366:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date range cannot exceed 366 days.",
        )

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

    return {
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


@router.get("/perf")
def get_dashboard_performance_snapshot(
    _: AuthContext = Depends(require_admin),
):
    return perf_metrics.snapshot()
