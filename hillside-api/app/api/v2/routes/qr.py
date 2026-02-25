from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import AuthContext, require_admin, require_authenticated
from app.core.config import settings
from app.core.qr_security import build_qr_signature, verify_qr_signature
from app.integrations.supabase_client import (
    consume_qr_token_record,
    create_qr_token_record,
    get_my_booking_details,
    get_qr_token_record,
    get_reservation_by_id,
    validate_qr_checkin,
)
from app.schemas.common import QrToken

router = APIRouter()


class QrIssueRequest(BaseModel):
    reservation_id: str


class QrVerifyRequest(BaseModel):
    reservation_code: str | None = None
    qr_token: QrToken | None = None
    scanner_id: str
    offline_mode: bool = False


@router.post("/issue", response_model=QrToken)
def issue_token(
    payload: QrIssueRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    if not settings.feature_dynamic_qr:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dynamic QR is disabled.",
        )
    if not settings.qr_signing_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="QR signing secret is not configured.",
        )

    reservation_id = payload.reservation_id
    reservation_row = (
        get_reservation_by_id(reservation_id)
        if auth.role == "admin"
        else get_my_booking_details(user_id=auth.user_id, reservation_id=reservation_id)
    )
    if not reservation_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found.")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=max(10, settings.qr_rotation_seconds))
    jti = str(uuid4())
    rotation_version = max(1, int(now.timestamp()) // max(1, settings.qr_rotation_seconds))
    signature = build_qr_signature(
        secret=settings.qr_signing_secret,
        jti=jti,
        reservation_id=reservation_id,
        expires_at=expires_at,
        rotation_version=rotation_version,
    )
    token = QrToken(
        jti=jti,
        reservation_id=reservation_id,
        expires_at=expires_at,
        signature=signature,
        rotation_version=rotation_version,
    )
    try:
        create_qr_token_record(
            jti=token.jti,
            reservation_id=token.reservation_id,
            reservation_code=str(reservation_row.get("reservation_code") or ""),
            rotation_version=token.rotation_version,
            signature=token.signature,
            token_payload=token.model_dump_json(),
            expires_at=token.expires_at,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return token


def _verify_dynamic_qr(payload: QrVerifyRequest, auth: AuthContext) -> dict:
    if not settings.feature_dynamic_qr:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dynamic QR verification is disabled.",
        )
    if not settings.qr_signing_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="QR signing secret is not configured.",
        )
    if not payload.qr_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="qr_token is required.")

    token = payload.qr_token
    now = datetime.now(timezone.utc)
    leeway = max(0, settings.qr_verify_leeway_seconds)
    if token.expires_at + timedelta(seconds=leeway) < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="QR token expired.")

    signature_ok = verify_qr_signature(
        secret=settings.qr_signing_secret,
        provided_signature=token.signature,
        jti=token.jti,
        reservation_id=token.reservation_id,
        expires_at=token.expires_at,
        rotation_version=token.rotation_version,
    )
    if not signature_ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid QR signature.")

    try:
        stored = get_qr_token_record(jti=token.jti)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not stored:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR token not found.")
    if bool(stored.get("revoked")):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="QR token revoked.")
    if bool(stored.get("consumed_at")):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="QR token already used.")
    stored_signature = str(stored.get("signature") or "")
    if stored_signature and stored_signature != token.signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="QR token signature mismatch.")

    stored_reservation_id = str(stored.get("reservation_id") or "")
    if stored_reservation_id != token.reservation_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="QR token reservation mismatch.")
    stored_expires_raw = stored.get("expires_at")
    if stored_expires_raw:
        try:
            stored_expires_at = datetime.fromisoformat(str(stored_expires_raw).replace("Z", "+00:00"))
            if stored_expires_at + timedelta(seconds=leeway) < now:
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="QR token expired.")
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Stored QR token expiry is invalid.")

    try:
        consumed = consume_qr_token_record(jti=token.jti, scanner_id=payload.scanner_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not consumed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="QR token already used.")

    reservation = get_reservation_by_id(token.reservation_id)
    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found.")

    reservation_code = str(reservation.get("reservation_code") or "")
    if not reservation_code:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Reservation code missing.")

    try:
        validation = validate_qr_checkin(access_token=auth.access_token, reservation_code=reservation_code)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if not validation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reservation not found for provided QR payload.",
        )
    return validation


def _verify_legacy_qr(payload: QrVerifyRequest, auth: AuthContext) -> dict:
    if not payload.reservation_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reservation_code is required.")

    try:
        validation = validate_qr_checkin(
            access_token=auth.access_token,
            reservation_code=payload.reservation_code,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not validation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reservation not found for provided QR payload.",
        )
    return validation


@router.post("/verify")
def verify_token(
    payload: QrVerifyRequest,
    auth: AuthContext = Depends(require_admin),
):
    if not payload.reservation_code and payload.qr_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either reservation_code or qr_token is required.",
        )

    if payload.qr_token is not None:
        validation = _verify_dynamic_qr(payload, auth)
    else:
        validation = _verify_legacy_qr(payload, auth)

    return {
        **validation,
        "scanner_id": payload.scanner_id,
        "offline_mode": payload.offline_mode,
    }
