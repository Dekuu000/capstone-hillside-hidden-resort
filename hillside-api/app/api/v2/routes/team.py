import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthContext, require_admin
from app.integrations.supabase_client import (
    create_team_member,
    list_team_members,
    update_team_member_role,
)
from app.schemas.common import (
    CreateTeamMemberRequest,
    TeamListResponse,
    TeamMember,
    UpdateTeamMemberRoleRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=TeamListResponse)
def get_team(auth: AuthContext = Depends(require_admin)):
    """List back-office accounts (Manager and System Admin can view)."""
    try:
        items = list_team_members()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return TeamListResponse(items=[TeamMember(**item) for item in items])


@router.post("", response_model=TeamMember, status_code=status.HTTP_201_CREATED)
def add_team_member(
    payload: CreateTeamMemberRequest, auth: AuthContext = Depends(require_admin)
):
    """Create a back-office account. The grant rule is enforced server-side."""
    try:
        row = create_team_member(
            actor_user_id=auth.user_id,
            actor_role=auth.role,
            name=payload.name,
            email=payload.email,
            role=payload.role,
            password=payload.password,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return TeamMember(**row)


@router.patch("/{user_id}", response_model=TeamMember)
def change_team_member_role(
    user_id: str,
    payload: UpdateTeamMemberRoleRequest,
    auth: AuthContext = Depends(require_admin),
):
    """Change a team member's role, guarded by the grant rule + safety checks."""
    try:
        row = update_team_member_role(
            actor_user_id=auth.user_id,
            actor_role=auth.role,
            target_user_id=user_id,
            new_role=payload.role,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return TeamMember(**row)
