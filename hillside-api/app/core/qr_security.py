from __future__ import annotations

import base64
import hmac
from datetime import datetime, timezone
from hashlib import sha256

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


def _canonical_signature_payload(
    *,
    jti: str,
    reservation_id: str,
    reservation_code: str | None,
    expires_at: datetime,
    rotation_version: int,
) -> bytes:
    exp_ts = int(expires_at.replace(tzinfo=timezone.utc).timestamp())
    return f"{jti}|{reservation_id}|{reservation_code or ''}|{exp_ts}|{rotation_version}".encode("utf-8")


def _canonical_signature_payload_legacy(
    *,
    jti: str,
    reservation_id: str,
    expires_at: datetime,
    rotation_version: int,
) -> bytes:
    exp_ts = int(expires_at.replace(tzinfo=timezone.utc).timestamp())
    return f"{jti}|{reservation_id}|{exp_ts}|{rotation_version}".encode("utf-8")


def _decode_key_material(value: str) -> bytes:
    raw = value.strip()
    if raw.startswith("base64:"):
        raw = raw.split(":", 1)[1]
    if raw.startswith("hex:"):
        raw = raw.split(":", 1)[1]
        return bytes.fromhex(raw)

    compact = "".join(raw.split())
    if all(ch in "0123456789abcdefABCDEF" for ch in compact) and len(compact) % 2 == 0:
        return bytes.fromhex(compact)

    padded = compact + "=" * ((4 - len(compact) % 4) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def _encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _load_private_key(*, private_key_material: str | None, legacy_secret: str | None) -> Ed25519PrivateKey:
    if private_key_material:
        key_bytes = _decode_key_material(private_key_material)
        if len(key_bytes) == 64:
            key_bytes = key_bytes[:32]
        if len(key_bytes) != 32:
            raise ValueError("QR signing private key must be 32-byte Ed25519 material.")
        return Ed25519PrivateKey.from_private_bytes(key_bytes)
    if legacy_secret:
        seed = sha256(legacy_secret.encode("utf-8")).digest()
        return Ed25519PrivateKey.from_private_bytes(seed)
    raise ValueError("QR signing key material is not configured.")


def _load_public_key(*, public_key_material: str | None) -> Ed25519PublicKey:
    if not public_key_material:
        raise ValueError("QR public key material is missing.")
    key_bytes = _decode_key_material(public_key_material)
    if len(key_bytes) != 32:
        raise ValueError("QR signing public key must be 32-byte Ed25519 material.")
    return Ed25519PublicKey.from_public_bytes(key_bytes)


def build_qr_signature(
    *,
    private_key_material: str | None,
    legacy_secret: str | None,
    jti: str,
    reservation_id: str,
    reservation_code: str | None,
    expires_at: datetime,
    rotation_version: int,
) -> str:
    private_key = _load_private_key(private_key_material=private_key_material, legacy_secret=legacy_secret)
    payload = _canonical_signature_payload(
        jti=jti,
        reservation_id=reservation_id,
        reservation_code=reservation_code,
        expires_at=expires_at,
        rotation_version=rotation_version,
    )
    return private_key.sign(payload).hex()


def get_qr_public_key_base64url(
    *,
    private_key_material: str | None,
    legacy_secret: str | None,
) -> str:
    private_key = _load_private_key(private_key_material=private_key_material, legacy_secret=legacy_secret)
    public_bytes = private_key.public_key().public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw)
    return _encode_base64url(public_bytes)


def get_qr_public_key_id(public_key_base64url: str) -> str:
    digest = sha256(public_key_base64url.encode("utf-8")).hexdigest()
    return f"qr-ed25519-{digest[:12]}"


def verify_qr_signature(
    *,
    public_key_material: str | None,
    legacy_secret: str | None,
    provided_signature: str,
    jti: str,
    reservation_id: str,
    reservation_code: str | None,
    expires_at: datetime,
    rotation_version: int,
) -> bool:
    # Preferred path: Ed25519 (hex-encoded 64-byte signature => 128 hex chars)
    try:
        signature_bytes = bytes.fromhex(provided_signature)
    except ValueError:
        signature_bytes = b""

    if len(signature_bytes) == 64 and public_key_material:
        payload = _canonical_signature_payload(
            jti=jti,
            reservation_id=reservation_id,
            reservation_code=reservation_code,
            expires_at=expires_at,
            rotation_version=rotation_version,
        )
        public_key = _load_public_key(public_key_material=public_key_material)
        try:
            public_key.verify(signature_bytes, payload)
            return True
        except InvalidSignature:
            # Backward-compatible retry against legacy payload without reservation_code.
            legacy_payload = _canonical_signature_payload_legacy(
                jti=jti,
                reservation_id=reservation_id,
                expires_at=expires_at,
                rotation_version=rotation_version,
            )
            try:
                public_key.verify(signature_bytes, legacy_payload)
                return True
            except InvalidSignature:
                return False

    # Backward-compatible path: legacy HMAC-SHA256 hex signatures (64 chars)
    if legacy_secret:
        expected = hmac.new(
            legacy_secret.encode("utf-8"),
            _canonical_signature_payload_legacy(
                jti=jti,
                reservation_id=reservation_id,
                expires_at=expires_at,
                rotation_version=rotation_version,
            ),
            sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, provided_signature)

    return False
