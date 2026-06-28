import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_admin, require_operations
from app.integrations.supabase_client import (
    ServiceRequestTransitionError,
    list_all_services,
    list_resort_service_requests,
    notify_guest_service_request,
    update_resort_service_request_status,
    update_service,
    update_service_images,
    waive_service_charge,
)
from app.schemas.common import (
    ResortServiceRequestItem,
    ResortServiceRequestListResponse,
    ResortServiceRequestStatusPatchRequest,
    ServiceImagesUpdateRequest,
    ServiceItem,
    ServiceListResponse,
    ServiceUpdateRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _invalidate_public_services_cache() -> None:
    """Clear the public catalog cache so tour edits show on guest pages right away."""
    try:
        from app.api.v2.routes.catalog import _CACHE as catalog_cache

        catalog_cache.clear()
    except Exception:  # noqa: BLE001
        logger.debug("Could not clear catalog cache after tour update", exc_info=True)


@router.get("/requests", response_model=ResortServiceRequestListResponse)
def list_admin_service_requests(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(new|in_progress|done|cancelled)$"),
    category: str | None = Query(default=None, pattern="^(room_service|spa)$"),
    search: str | None = Query(default=None, max_length=120),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_operations),
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


@router.get("/catalog", response_model=ServiceListResponse)
def list_service_catalog(_auth: AuthContext = Depends(require_admin)):
    """Admin: all tour/day-pass services (any status) for photo management."""
    try:
        rows = list_all_services()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in GET /v2/admin/services/catalog")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while loading tour catalog: {exc}",
        ) from exc
    return {"items": rows, "count": len(rows)}


@router.patch("/catalog/{service_id}/images", response_model=ServiceItem)
def patch_service_images(
    service_id: str,
    payload: ServiceImagesUpdateRequest,
    _auth: AuthContext = Depends(require_admin),
):
    """Admin: replace a tour's photo gallery (managed in storage by the client)."""
    try:
        row = update_service_images(
            service_id=service_id,
            image_urls=payload.image_urls,
            image_thumb_urls=payload.image_thumb_urls,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in PATCH /v2/admin/services/catalog/%s/images", service_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while updating tour photos: {exc}",
        ) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tour not found.")

    _invalidate_public_services_cache()
    return row


@router.patch("/catalog/{service_id}", response_model=ServiceItem)
def patch_service_details(
    service_id: str,
    payload: ServiceUpdateRequest,
    _auth: AuthContext = Depends(require_admin),
):
    """Admin: update a tour's rates and visibility (status)."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No tour fields provided for update.",
        )
    try:
        row = update_service(service_id=service_id, payload=updates)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in PATCH /v2/admin/services/catalog/%s", service_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while updating tour: {exc}",
        ) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tour not found.")

    _invalidate_public_services_cache()
    return row


@router.patch("/requests/{request_id}", response_model=ResortServiceRequestItem)
def patch_admin_service_request(
    request_id: str,
    payload: ResortServiceRequestStatusPatchRequest,
    auth: AuthContext = Depends(require_operations),
):
    try:
        row = update_resort_service_request_status(
            access_token=auth.access_token,
            request_id=request_id,
            status=payload.status,
            processed_by_user_id=auth.user_id,
            notes=payload.notes,
        )
    except ServiceRequestTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
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
    notify_guest_service_request(row)
    return row


@router.post("/requests/{request_id}/waive", response_model=ResortServiceRequestItem)
def waive_admin_service_request(
    request_id: str,
    auth: AuthContext = Depends(require_operations),
):
    """Comp an add-on charge — removes it from the guest's folio without collecting."""
    try:
        row = waive_service_charge(
            access_token=auth.access_token,
            request_id=request_id,
            waived_by_user_id=auth.user_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service request not found.")
    return row
