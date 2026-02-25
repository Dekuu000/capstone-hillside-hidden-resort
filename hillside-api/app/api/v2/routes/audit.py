from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException, status

from app.core.auth import AuthContext, require_admin
from app.integrations.supabase_client import list_audit_logs
from app.schemas.common import AuditLogsResponse

router = APIRouter()


@router.get("/logs", response_model=AuditLogsResponse)
def get_audit_logs(
    limit: int = Query(default=10, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    anchored: str | None = Query(default=None, pattern="^(anchored|unanchored)$"),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    search: str | None = Query(default=None, max_length=120),
    _auth: AuthContext = Depends(require_admin),
):
    if from_ts and to_ts and to_ts < from_ts:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="to must be greater than or equal to from.",
        )

    try:
        rows, total = list_audit_logs(
            limit=limit,
            offset=offset,
            action=action,
            entity_type=entity_type,
            anchored=anchored,
            from_ts=from_ts.isoformat() if from_ts else None,
            to_ts=to_ts.isoformat() if to_ts else None,
            search=search,
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
