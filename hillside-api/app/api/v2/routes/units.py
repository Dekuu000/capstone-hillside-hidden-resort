from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_admin
from app.core.cache import TTLCache
from app.core.config import settings
from app.integrations.supabase_client import (
    create_unit,
    get_unit_by_id,
    list_units_admin,
    soft_delete_unit,
    update_unit,
    update_unit_status,
)
from app.schemas.common import (
    UnitCreateRequest,
    UnitDeleteResponse,
    UnitItem,
    UnitListResponse,
    UnitStatusUpdateRequest,
    UnitStatusUpdateResponse,
    UnitUpdateRequest,
    UnitWriteResponse,
)

router = APIRouter()
_CACHE = TTLCache(settings.cache_ttl_seconds)


@router.get("", response_model=UnitListResponse)
def get_units(
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    unit_type: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120),
    _auth: AuthContext = Depends(require_admin),
):
    cache_key = f"units:list:{limit}:{offset}:{unit_type}:{is_active}:{search}"
    cached = _CACHE.get(cache_key)
    if cached:
        return cached

    try:
        rows, total = list_units_admin(
            limit=limit,
            offset=offset,
            unit_type=unit_type,
            is_active=is_active,
            search=search,
        )
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


@router.get("/{unit_id}", response_model=UnitItem)
def get_unit(
    unit_id: str,
    _auth: AuthContext = Depends(require_admin),
):
    try:
        row = get_unit_by_id(unit_id=unit_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
    return row


@router.post("", response_model=UnitWriteResponse)
def post_unit(
    payload: UnitCreateRequest,
    _auth: AuthContext = Depends(require_admin),
):
    try:
        unit = create_unit(payload=payload.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    _CACHE.clear()
    return {"ok": True, "unit": unit}


@router.patch("/{unit_id}", response_model=UnitWriteResponse)
def patch_unit(
    unit_id: str,
    payload: UnitUpdateRequest,
    _auth: AuthContext = Depends(require_admin),
):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No unit fields provided for update.",
        )

    try:
        unit = update_unit(unit_id=unit_id, payload=updates)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

    _CACHE.clear()
    return {"ok": True, "unit": unit}


@router.delete("/{unit_id}", response_model=UnitDeleteResponse)
def delete_unit(
    unit_id: str,
    _auth: AuthContext = Depends(require_admin),
):
    try:
        row = soft_delete_unit(unit_id=unit_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

    _CACHE.clear()
    return {
        "ok": True,
        "unit_id": unit_id,
        "is_active": False,
    }


@router.patch("/{unit_id}/status", response_model=UnitStatusUpdateResponse)
def patch_unit_status(
    unit_id: str,
    payload: UnitStatusUpdateRequest,
    _auth: AuthContext = Depends(require_admin),
):
    try:
        unit = update_unit_status(unit_id=unit_id, is_active=payload.is_active)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

    _CACHE.clear()
    return {
        "ok": True,
        "unit": unit,
    }
