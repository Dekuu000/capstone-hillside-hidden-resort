from dataclasses import dataclass
import hashlib
import time

from fastapi import Depends, HTTPException, Request, status

from app.integrations.supabase_client import get_supabase_client


@dataclass
class AuthContext:
    user_id: str
    email: str | None
    role: str
    access_token: str


_ROLE_CACHE_TTL_SECONDS = 60.0
_ROLE_CACHE: dict[str, tuple[str, float]] = {}
_AUTH_CACHE_TTL_SECONDS = 30.0
_AUTH_CACHE: dict[str, tuple[AuthContext, float]] = {}


def _extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token.",
        )
    token = auth_header[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token is empty.",
        )
    return token


def _resolve_role(user_id: str) -> str:
    cached = _ROLE_CACHE.get(user_id)
    now = time.monotonic()
    if cached and (now - cached[1]) <= _ROLE_CACHE_TTL_SECONDS:
        return cached[0]

    client = get_supabase_client()
    response = (
        client.table("users")
        .select("role")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if rows and rows[0].get("role"):
        role = str(rows[0]["role"]).lower()
    else:
        role = "guest"

    _ROLE_CACHE[user_id] = (role, now)
    return role


def verify_access_token(access_token: str) -> AuthContext:
    cache_key = hashlib.sha256(access_token.encode("utf-8")).hexdigest()
    cached_auth = _AUTH_CACHE.get(cache_key)
    now = time.monotonic()
    if cached_auth and (now - cached_auth[1]) <= _AUTH_CACHE_TTL_SECONDS:
        return cached_auth[0]

    client = get_supabase_client()
    try:
        user_response = client.auth.get_user(access_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token.",
        ) from exc

    user = getattr(user_response, "user", None)
    if not user or not getattr(user, "id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user not found.",
        )

    user_id = str(user.id)
    email = getattr(user, "email", None)
    role = _resolve_role(user_id)

    auth_context = AuthContext(
        user_id=user_id,
        email=email,
        role=role,
        access_token=access_token,
    )
    _AUTH_CACHE[cache_key] = (auth_context, now)
    return auth_context


def get_current_auth(request: Request) -> AuthContext:
    token = _extract_bearer_token(request)
    return verify_access_token(token)


# Nested back-office tiers: guest < staff (Front Desk) < admin (Manager) < super_admin.
# "admin" is kept as the Manager role so existing checks keep working.
ROLE_RANK: dict[str, int] = {"guest": 0, "staff": 1, "admin": 2, "super_admin": 3}


def role_at_least(role: str | None, minimum: str) -> bool:
    return ROLE_RANK.get(str(role or "").lower(), 0) >= ROLE_RANK[minimum]


def require_authenticated(auth: AuthContext = Depends(get_current_auth)) -> AuthContext:
    return auth


def require_operations(auth: AuthContext = Depends(get_current_auth)) -> AuthContext:
    """Front Desk and up: check-in, walk-in, on-site payment, service queue."""
    if not role_at_least(auth.role, "staff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff access required.",
        )
    return auth


def require_admin(auth: AuthContext = Depends(get_current_auth)) -> AuthContext:
    """Manager and up (Management tier): reservations, units, payments, reports."""
    if not role_at_least(auth.role, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return auth


def require_technical(auth: AuthContext = Depends(get_current_auth)) -> AuthContext:
    """System Admin only: blockchain/escrow, AI, audit, chains, perf-sensitive tools."""
    if not role_at_least(auth.role, "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System Admin access required.",
        )
    return auth


def ensure_reservation_access(auth: AuthContext, reservation_row: dict) -> None:
    # Any back-office user (Front Desk and up) may access any reservation (e.g. check-in lookup).
    if role_at_least(auth.role, "staff"):
        return

    owner = reservation_row.get("guest_user_id")
    if owner and owner == auth.user_id:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not allowed to access this reservation.",
    )
