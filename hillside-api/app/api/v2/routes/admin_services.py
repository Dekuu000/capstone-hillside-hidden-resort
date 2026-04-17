import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_admin
from app.integrations.supabase_client import (
    list_resort_service_requests,
    update_resort_service_request_status,
)
from app.schemas.common import (
    ResortServiceRequestItem,
    ResortServiceRequestListResponse,
    ResortServiceRequestStatusPatchRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/requests", response_model=ResortServiceRequestListResponse)
def list_admin_service_requests(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(new|in_progress|done|cancelled)$"),
    category: str | None = Query(default=None, pattern="^(room_service|spa)$"),
    search: str | None = Query(default=None, max_length=120),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_admin),
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
        logger.exception("Unexpected error in GET /v2/admin/services/requests user_id=%s", auth.user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading admin queue: {exc}",
        ) from exc

    return {
        "items": rows,
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


@router.patch("/requests/{request_id}", response_model=ResortServiceRequestItem)
def patch_admin_service_request(
    request_id: str,
    payload: ResortServiceRequestStatusPatchRequest,
    auth: AuthContext = Depends(require_admin),
):
    try:
        row = update_resort_service_request_status(
            access_token=auth.access_token,
            request_id=request_id,
            status=payload.status,
            processed_by_user_id=auth.user_id,
            notes=payload.notes,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in PATCH /v2/admin/services/requests/%s", request_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while updating request: {exc}",
        ) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found.")
    return row
