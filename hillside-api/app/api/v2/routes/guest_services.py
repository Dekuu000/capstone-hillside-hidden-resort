import logging
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_authenticated
from app.integrations.supabase_client import (
    create_resort_service_request,
    get_sync_operation_receipt,
    list_active_resort_services,
    list_resort_service_requests,
    upsert_sync_operation_receipt,
)
from app.schemas.common import (
    ResortServiceListResponse,
    ResortServiceRequestCreateRequest,
    ResortServiceRequestItem,
    ResortServiceRequestListResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_idempotency_operation_id(*, route_key: str, user_id: str, idempotency_key: str) -> str:
    digest = hashlib.sha256(f"{route_key}:{user_id}:{idempotency_key}".encode("utf-8")).hexdigest()
    return f"{route_key}:{digest[:40]}"


@router.get("", response_model=ResortServiceListResponse)
def get_guest_services(
    category: str | None = Query(default=None, pattern="^(room_service|spa)$"),
    _auth: AuthContext = Depends(require_authenticated),
):
    try:
        rows = list_active_resort_services(category=category)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in /v2/guest/services")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading services: {exc}",
        ) from exc

    return {
        "items": rows,
        "count": len(rows),
    }


@router.post("/requests", response_model=ResortServiceRequestItem)
def create_guest_service_request(
    payload: ResortServiceRequestCreateRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    operation_id: str | None = None
    if payload.idempotency_key:
        operation_id = _build_idempotency_operation_id(
            route_key="guest_services.requests.create",
            user_id=auth.user_id,
            idempotency_key=payload.idempotency_key,
        )
        try:
            existing_receipt = get_sync_operation_receipt(
                operation_id=operation_id,
                user_id=auth.user_id,
                idempotency_key=payload.idempotency_key,
            )
        except RuntimeError:
            logger.warning("Service request idempotency replay lookup skipped (user_id=%s)", auth.user_id)
            existing_receipt = None
        if existing_receipt and isinstance(existing_receipt.get("response_payload"), dict):
            return existing_receipt["response_payload"]

    try:
        row = create_resort_service_request(
            access_token=auth.access_token,
            guest_user_id=auth.user_id,
            service_item_id=payload.service_item_id,
            reservation_id=payload.reservation_id,
            quantity=payload.quantity,
            preferred_time=payload.preferred_time.isoformat() if payload.preferred_time else None,
            notes=payload.notes,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in POST /v2/guest/services/requests user_id=%s", auth.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while creating request: {exc}",
        ) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create request.")
    if payload.idempotency_key and operation_id:
        try:
            upsert_sync_operation_receipt(
                operation_id=operation_id,
                idempotency_key=payload.idempotency_key,
                user_id=auth.user_id,
                entity_type="service_request",
                entity_id=str(row.get("request_id") or ""),
                action="guest_services.requests.create",
                status="applied",
                http_status=200,
                response_payload=row,
            )
        except RuntimeError:
            logger.warning("Service request idempotency receipt store skipped (user_id=%s)", auth.user_id)
    return row


@router.get("/requests", response_model=ResortServiceRequestListResponse)
def list_guest_service_requests(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(new|in_progress|done|cancelled)$"),
    category: str | None = Query(default=None, pattern="^(room_service|spa)$"),
    search: str | None = Query(default=None, max_length=120),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        rows, total = list_resort_service_requests(
            access_token=auth.access_token,
            role=auth.role,
            user_id=auth.user_id,
            status_filter=status_filter,
            category_filter=category,
            search=search,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in GET /v2/guest/services/requests user_id=%s", auth.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading requests: {exc}",
        ) from exc

    return {
        "items": rows,
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }
