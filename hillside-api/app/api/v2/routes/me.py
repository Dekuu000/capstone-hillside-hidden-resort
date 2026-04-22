import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_authenticated
from app.integrations.supabase_client import (
    get_latest_guest_welcome_notification,
    get_my_booking_details,
    get_my_active_or_upcoming_stay,
    get_my_profile,
    list_my_bookings,
    list_my_reservations,
    mark_guest_welcome_notification_read,
    patch_my_profile,
)
from app.schemas.common import (
    MyProfilePatchRequest,
    MyProfileResponse,
    MyBookingsResponse,
    ReservationListItem,
    ReservationListResponse,
    StayDashboardResponse,
    WelcomeNotification,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/profile", response_model=MyProfileResponse)
def get_me_profile(auth: AuthContext = Depends(require_authenticated)):
    try:
        row = get_my_profile(user_id=auth.user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /v2/me/profile for user_id=%s", auth.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading profile: {exc}",
        ) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return row


@router.patch("/profile", response_model=MyProfileResponse)
def patch_me_profile(
    payload: MyProfilePatchRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    patch: dict[str, str | None] = {}
    fields_set = getattr(payload, "model_fields_set", set())

    if "name" in fields_set:
        patch["name"] = (payload.name or "").strip() or None
    if "phone" in fields_set:
        patch["phone"] = (payload.phone or "").strip() or None
    if "wallet_address" in fields_set:
        normalized_wallet = (payload.wallet_address or "").strip() or None
        patch["wallet_address"] = normalized_wallet.lower() if normalized_wallet else None
    if "wallet_chain" in fields_set:
        patch["wallet_chain"] = (payload.wallet_chain or "evm").strip().lower() or "evm"
    elif "wallet_address" in fields_set and payload.wallet_address is not None:
        patch["wallet_chain"] = "evm"

    try:
        row = patch_my_profile(
            access_token=auth.access_token,
            user_id=auth.user_id,
            patch=patch,
        )
    except RuntimeError as exc:
        message = str(exc).lower()
        if "wallet_address" in message or "wallet" in message:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid wallet address format.") from exc
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in PATCH /v2/me/profile for user_id=%s", auth.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while updating profile: {exc}",
        ) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return row


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


@router.get("/stay-dashboard", response_model=StayDashboardResponse)
def get_my_stay_dashboard(auth: AuthContext = Depends(require_authenticated)):
    try:
        reservation = get_my_active_or_upcoming_stay(user_id=auth.user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /v2/me/stay-dashboard for user_id=%s", auth.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading stay dashboard: {exc}",
        ) from exc

    welcome_notification = None
    if reservation and reservation.get("reservation_id"):
        try:
            welcome_notification = get_latest_guest_welcome_notification(
                guest_user_id=auth.user_id,
                reservation_id=str(reservation.get("reservation_id")),
            )
        except RuntimeError:
            logger.exception(
                "Failed to load welcome notification for user_id=%s reservation_id=%s",
                auth.user_id,
                reservation.get("reservation_id"),
            )

    return {
        "reservation": reservation,
        "welcome_notification": welcome_notification,
    }


@router.patch("/welcome/{notification_id}/read", response_model=WelcomeNotification)
def mark_welcome_read(
    notification_id: str,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        row = mark_guest_welcome_notification_read(
            guest_user_id=auth.user_id,
            notification_id=notification_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Unexpected error in PATCH /v2/me/welcome/%s/read for user_id=%s",
            notification_id,
            auth.user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while updating welcome notification: {exc}",
        ) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Welcome notification not found")
    return row
