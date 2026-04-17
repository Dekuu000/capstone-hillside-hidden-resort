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
    UnitOperationalStatus,
    UnitOperationalStatusUpdateRequest,
    UnitStatusUpdateRequest,
    UnitStatusUpdateResponse,
    UnitUpdateRequest,
    UnitWriteResponse,
)

router = APIRouter()
_CACHE = TTLCache(settings.cache_ttl_seconds)


def _derive_unit_code(name: str) -> str:
    normalized = "".join(ch for ch in name.upper() if ch.isalnum())
    return (normalized[:12] or "UNIT")


@router.get("", response_model=UnitListResponse)
def get_units(
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    unit_type: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    operational_status: UnitOperationalStatus | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120),
    _auth: AuthContext = Depends(require_admin),
):
    cache_key = f"units:list:{limit}:{offset}:{unit_type}:{is_active}:{operational_status}:{search}"
    cached = _CACHE.get(cache_key)
    if cached:
        return cached

    try:
        query_args = {
            "limit": limit,
            "offset": offset,
            "unit_type": unit_type,
            "is_active": is_active,
            "search": search,
        }
        if operational_status:
            query_args["operational_status"] = operational_status.value
        rows, total = list_units_admin(**query_args)
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
    create_payload = payload.model_dump()
    create_payload["unit_code"] = (create_payload.get("unit_code") or "").strip() or _derive_unit_code(payload.name)
    if create_payload.get("is_active") is False and "operational_status" not in create_payload:
        create_payload["operational_status"] = "maintenance"

    try:
        unit = create_unit(payload=create_payload)
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
    if "is_active" in updates and "operational_status" not in updates:
        updates["operational_status"] = "cleaned" if updates["is_active"] else "maintenance"

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


@router.patch("/{unit_id}/operational-status", response_model=UnitStatusUpdateResponse)
def patch_unit_operational_status(
    unit_id: str,
    payload: UnitOperationalStatusUpdateRequest,
    _auth: AuthContext = Depends(require_admin),
):
    try:
        unit = update_unit(
            unit_id=unit_id,
            payload={"operational_status": payload.operational_status.value},
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

    _CACHE.clear()
    return {
        "ok": True,
        "unit": unit,
    }
