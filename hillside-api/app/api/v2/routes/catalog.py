from datetime import date

from fastapi import APIRouter, HTTPException, Query, status

from app.core.cache import TTLCache
from app.core.config import settings
from app.integrations.supabase_client import (
    get_available_units as get_available_units_rpc,
    list_active_services as list_active_services_rpc,
    list_active_units_public,
    list_unit_reviews,
)
from app.schemas.common import (
    ReviewItem,
    ReviewSummary,
    ServiceListResponse,
    UnitReviewsResponse,
)

router = APIRouter()
_CACHE = TTLCache(settings.cache_ttl_seconds)


@router.get("/units")
def list_public_units(
    unit_type: str | None = Query(default=None),
    limit: int = Query(default=60, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Public catalog of active units (no auth, no dates) for browse/marketing."""
    cache_key = f"catalog:units:public:{unit_type or 'all'}:{limit}:{offset}"
    cached = _CACHE.get(cache_key)
    if cached:
        return cached

    try:
        rows, total = list_active_units_public(unit_type=unit_type, limit=limit, offset=offset)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    payload = {
        "items": rows,
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }
    _CACHE.set(cache_key, payload)
    return payload


@router.get("/units/available")
def get_available_units(
    check_in_date: date = Query(...),
    check_out_date: date = Query(...),
    unit_type: str | None = Query(default=None),
):
    """Public availability check for a date range (no auth)."""
    if check_out_date <= check_in_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="check_out_date must be after check_in_date.",
        )

    try:
        rows = get_available_units_rpc(
            check_in_date=check_in_date.isoformat(),
            check_out_date=check_out_date.isoformat(),
            unit_type=unit_type,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return {
        "items": rows,
        "count": len(rows),
        "check_in_date": check_in_date.isoformat(),
        "check_out_date": check_out_date.isoformat(),
    }


@router.get("/services", response_model=ServiceListResponse)
def get_active_services():
    """Public catalog of active tour/day-pass services (no auth) for browse/marketing."""
    cache_key = "catalog:services:active"
    cached = _CACHE.get(cache_key)
    if cached:
        return cached

    try:
        rows = list_active_services_rpc()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    payload = {
        "items": rows,
        "count": len(rows),
    }
    _CACHE.set(cache_key, payload)
    return payload


@router.get("/units/{unit_id}/reviews", response_model=UnitReviewsResponse)
def get_unit_reviews(unit_id: str):
    try:
        items, summary = list_unit_reviews(unit_id=unit_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return UnitReviewsResponse(
        unit_id=unit_id,
        summary=ReviewSummary(**summary),
        items=[ReviewItem(**item) for item in items],
    )
