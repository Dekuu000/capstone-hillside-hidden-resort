import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_authenticated
from app.integrations.supabase_client import (
    get_my_booking_details,
    list_my_bookings,
    list_my_reservations,
)
from app.schemas.common import (
    MyBookingsResponse,
    ReservationListItem,
    ReservationListResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/reservations", response_model=ReservationListResponse)
def get_my_reservations(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=120),
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        rows, total = list_my_reservations(
            user_id=auth.user_id,
            limit=limit,
            offset=offset,
            status_filter=status_filter,
            search=search,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /v2/me/reservations for user_id=%s", auth.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading reservations: {exc}",
        ) from exc

    return {
        "items": rows,
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


@router.get("/bookings", response_model=MyBookingsResponse)
def get_my_bookings(
    tab: str = Query(default="upcoming", pattern="^(upcoming|pending_payment|completed|cancelled)$"),
    limit: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=120),
    cursor_check_in_date: str | None = Query(default=None, alias="cursor_check_in_date"),
    cursor_created_at: str | None = Query(default=None, alias="cursor_created_at"),
    cursor_reservation_id: str | None = Query(default=None, alias="cursor_reservation_id"),
    auth: AuthContext = Depends(require_authenticated),
):
    cursor = None
    if cursor_created_at and cursor_reservation_id:
        cursor = {
            "check_in_date": cursor_check_in_date or "",
            "created_at": cursor_created_at,
            "reservation_id": cursor_reservation_id,
        }

    try:
        data = list_my_bookings(
            user_id=auth.user_id,
            tab=tab,
            limit=limit,
            cursor=cursor,
            search=search,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /v2/me/bookings for user_id=%s tab=%s", auth.user_id, tab)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading bookings: {exc}",
        ) from exc

    return data


@router.get("/bookings/{reservation_id}", response_model=ReservationListItem)
def get_my_booking_by_id(
    reservation_id: str,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        row = get_my_booking_details(user_id=auth.user_id, reservation_id=reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Unexpected error in /v2/me/bookings/%s for user_id=%s",
            reservation_id,
            auth.user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading booking detail: {exc}",
        ) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return row
