from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_admin
from app.integrations.supabase_client import (
    get_report_daily as get_report_daily_rpc,
    get_report_monthly as get_report_monthly_rpc,
    get_report_summary as get_report_summary_rpc,
    list_report_transactions as list_report_transactions_rpc,
)
from app.schemas.common import ReportTransactionsResponse, ReportsOverviewResponse

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


def _day_start_iso(value: date) -> str:
    return datetime.combine(value, time.min, tzinfo=timezone.utc).isoformat()


def _day_end_iso(value: date) -> str:
    return datetime.combine(value, time.max, tzinfo=timezone.utc).isoformat()


@router.get("/overview", response_model=ReportsOverviewResponse)
def get_reports_overview(
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
        summary_row = get_report_summary_rpc(
            access_token=auth.access_token,
            start_date=from_value.isoformat(),
            end_date=to_value.isoformat(),
        )
        daily_rows = get_report_daily_rpc(
            access_token=auth.access_token,
            start_date=from_value.isoformat(),
            end_date=to_value.isoformat(),
        )
        monthly_rows = get_report_monthly_rpc(
            access_token=auth.access_token,
            start_date=from_value.isoformat(),
            end_date=to_value.isoformat(),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return {
        "from_date": from_value.isoformat(),
        "to_date": to_value.isoformat(),
        "summary": {
            "bookings": _to_int(summary_row.get("bookings")),
            "cancellations": _to_int(summary_row.get("cancellations")),
            "cash_collected": _to_float(summary_row.get("cash_collected")),
            "occupancy_rate": _to_float(summary_row.get("occupancy_rate")),
            "unit_booked_value": _to_float(summary_row.get("unit_booked_value")),
            "tour_booked_value": _to_float(summary_row.get("tour_booked_value")),
        },
        "daily": [
            {
                "report_date": row.get("report_date"),
                "bookings": _to_int(row.get("bookings")),
                "cancellations": _to_int(row.get("cancellations")),
                "cash_collected": _to_float(row.get("cash_collected")),
                "occupancy_rate": _to_float(row.get("occupancy_rate")),
                "unit_booked_value": _to_float(row.get("unit_booked_value")),
                "tour_booked_value": _to_float(row.get("tour_booked_value")),
            }
            for row in (daily_rows or [])
        ],
        "monthly": [
            {
                "report_month": row.get("report_month"),
                "bookings": _to_int(row.get("bookings")),
                "cancellations": _to_int(row.get("cancellations")),
                "cash_collected": _to_float(row.get("cash_collected")),
                "occupancy_rate": _to_float(row.get("occupancy_rate")),
                "unit_booked_value": _to_float(row.get("unit_booked_value")),
                "tour_booked_value": _to_float(row.get("tour_booked_value")),
            }
            for row in (monthly_rows or [])
        ],
    }


@router.get("/transactions", response_model=ReportTransactionsResponse)
def get_report_transactions(
    from_date: date = Query(...),
    to_date: date = Query(...),
    status_filter: str | None = Query(default=None, alias="status"),
    method: str | None = Query(default=None),
    payment_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _auth: AuthContext = Depends(require_admin),
):
    if to_date < from_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="to_date must be on or after from_date.",
        )

    range_days = (to_date - from_date).days
    if range_days > 366:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date range cannot exceed 366 days.",
        )

    try:
        rows, total = list_report_transactions_rpc(
            from_ts=_day_start_iso(from_date),
            to_ts=_day_end_iso(to_date),
            status_filter=status_filter,
            method=method,
            payment_type=payment_type,
            limit=limit,
            offset=offset,
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
