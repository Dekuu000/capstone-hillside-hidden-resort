from __future__ import annotations

import hmac
from datetime import datetime, timezone
from hashlib import sha256


def _canonical_signature_payload(
    *,
    jti: str,
    reservation_id: str,
    expires_at: datetime,
    rotation_version: int,
) -> str:
    exp_ts = int(expires_at.replace(tzinfo=timezone.utc).timestamp())
    return f"{jti}|{reservation_id}|{exp_ts}|{rotation_version}"


def build_qr_signature(
    *,
    secret: str,
    jti: str,
    reservation_id: str,
    expires_at: datetime,
    rotation_version: int,
) -> str:
    payload = _canonical_signature_payload(
        jti=jti,
        reservation_id=reservation_id,
        expires_at=expires_at,
        rotation_version=rotation_version,
    )
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), sha256).hexdigest()


def verify_qr_signature(
    *,
    secret: str,
    provided_signature: str,
    jti: str,
    reservation_id: str,
    expires_at: datetime,
    rotation_version: int,
) -> bool:
    expected = build_qr_signature(
        secret=secret,
        jti=jti,
        reservation_id=reservation_id,
        expires_at=expires_at,
        rotation_version=rotation_version,
    )
    return hmac.compare_digest(expected, provided_signature)
