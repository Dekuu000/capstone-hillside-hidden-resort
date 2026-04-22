from fastapi import APIRouter, Depends

from app.core.auth import AuthContext, require_authenticated, verify_access_token
from app.schemas.common import SessionRequest, SessionResponse

router = APIRouter()


@router.post("/session", response_model=SessionResponse)
def create_session(payload: SessionRequest):
    auth = verify_access_token(payload.supabase_access_token)
    return SessionResponse(
        session_id=f"session-{auth.user_id}",
        user={"id": auth.user_id, "role": auth.role, "email": auth.email},
    )


@router.get("/context")
def get_context(auth: AuthContext = Depends(require_authenticated)):
    return {
        "user_id": auth.user_id,
        "email": auth.email,
        "role": auth.role,
    }
