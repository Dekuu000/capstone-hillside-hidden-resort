from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_authenticated
from app.integrations.supabase_client import (
    get_available_units as get_available_units_rpc,
    list_active_services as list_active_services_rpc,
)
from app.schemas.common import ServiceListResponse

router = APIRouter()


@router.get("/units/available")
def get_available_units(
    check_in_date: date = Query(...),
    check_out_date: date = Query(...),
    unit_type: str | None = Query(default=None),
    _auth: AuthContext = Depends(require_authenticated),
):
    if check_out_date <= check_in_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
def get_active_services(_auth: AuthContext = Depends(require_authenticated)):
    try:
        rows = list_active_services_rpc()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return {
        "items": rows,
        "count": len(rows),
    }
