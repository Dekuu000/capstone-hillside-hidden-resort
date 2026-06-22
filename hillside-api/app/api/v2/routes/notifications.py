import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_authenticated
from app.integrations.supabase_client import (
    count_unread_notifications,
    list_notifications,
    mark_notifications_read,
)
from app.schemas.common import (
    NotificationItem,
    NotificationListResponse,
    NotificationMarkReadRequest,
    NotificationMarkReadResponse,
    NotificationUnreadCountResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _to_item(row: dict[str, Any]) -> NotificationItem:
    metadata = row.get("metadata")
    return NotificationItem(
        notification_id=str(row.get("notification_id")),
        category=str(row.get("category") or "system"),
        event_type=str(row.get("event_type") or "unknown"),
        title=str(row.get("title") or ""),
        body=row.get("body"),
        severity=str(row.get("severity") or "info"),
        entity_type=row.get("entity_type"),
        entity_id=(str(row["entity_id"]) if row.get("entity_id") is not None else None),
        link=row.get("link"),
        metadata=metadata if isinstance(metadata, dict) else {},
        created_at=str(row.get("created_at") or ""),
        read_at=row.get("read_at"),
    )


@router.get("", response_model=NotificationListResponse)
def get_notifications(
    auth: AuthContext = Depends(require_authenticated),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
):
    try:
        rows, has_more = list_notifications(
            recipient_user_id=auth.user_id, limit=limit, offset=offset, unread_only=unread_only
        )
        unread = count_unread_notifications(recipient_user_id=auth.user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return NotificationListResponse(
        items=[_to_item(row) for row in rows], unread_count=unread, has_more=has_more
    )


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
def get_unread_count(auth: AuthContext = Depends(require_authenticated)):
    try:
        unread = count_unread_notifications(recipient_user_id=auth.user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return NotificationUnreadCountResponse(unread_count=unread)


@router.post("/mark-read", response_model=NotificationMarkReadResponse)
def mark_read(
    payload: NotificationMarkReadRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        updated = mark_notifications_read(
            recipient_user_id=auth.user_id,
            notification_ids=payload.notification_ids,
            mark_all=payload.all,
        )
        unread = count_unread_notifications(recipient_user_id=auth.user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return NotificationMarkReadResponse(updated=updated, unread_count=unread)
