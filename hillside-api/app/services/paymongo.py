from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# PayMongo requires a minimum charge of PHP 20.00 (2000 centavos).
PAYMONGO_MIN_CENTAVOS = 2000


class PayMongoError(RuntimeError):
    """Raised when a PayMongo API call cannot be completed."""


def is_configured() -> bool:
    return bool(str(settings.paymongo_secret_key or "").strip())


def php_to_centavos(amount_php: float) -> int:
    """Convert a peso amount to integer centavos (PayMongo's unit)."""
    return int(round(float(amount_php) * 100))


def _auth_header() -> str:
    key = str(settings.paymongo_secret_key or "").strip()
    if not key:
        raise PayMongoError("PAYMONGO_SECRET_KEY is not configured.")
    token = base64.b64encode(f"{key}:".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def create_gcash_checkout_session(
    *,
    amount_centavos: int,
    description: str,
    line_item_name: str,
    reference_number: str,
    success_url: str,
    cancel_url: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    """Create a PayMongo Hosted Checkout session with GCash enabled.

    Server-side only (uses the secret key). Returns
    ``{checkout_session_id, checkout_url, payment_intent_id}``. Raises
    :class:`PayMongoError` on any failure.
    """
    if int(amount_centavos) < PAYMONGO_MIN_CENTAVOS:
        raise PayMongoError("Amount is below the PayMongo minimum of PHP 20.00.")

    base = str(settings.paymongo_base_url or "https://api.paymongo.com").rstrip("/")
    payload = {
        "data": {
            "attributes": {
                "line_items": [
                    {
                        "name": (line_item_name or "Reservation deposit")[:255],
                        "amount": int(amount_centavos),
                        "currency": "PHP",
                        "quantity": 1,
                    }
                ],
                "payment_method_types": ["gcash"],
                "description": (description or "")[:255],
                "reference_number": (reference_number or "")[:255],
                "success_url": success_url,
                "cancel_url": cancel_url,
                # PayMongo metadata values must be strings.
                "metadata": {str(k): str(v) for k, v in (metadata or {}).items()},
            }
        }
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(
                f"{base}/v1/checkout_sessions",
                headers={
                    "Authorization": _auth_header(),
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:  # network/timeout
        raise PayMongoError(f"PayMongo request failed: {exc}") from exc

    if response.status_code >= 400:
        raise PayMongoError(f"PayMongo error {response.status_code}: {response.text[:500]}")

    body = response.json()
    data = body.get("data") or {}
    attributes = data.get("attributes") or {}
    checkout_url = str(attributes.get("checkout_url") or "").strip()
    session_id = str(data.get("id") or "").strip()
    payment_intent = attributes.get("payment_intent")
    payment_intent_id = (
        str(payment_intent.get("id") or "").strip() if isinstance(payment_intent, dict) else ""
    )
    if not checkout_url or not session_id:
        raise PayMongoError("PayMongo response missing checkout_url / session id.")

    return {
        "checkout_session_id": session_id,
        "checkout_url": checkout_url,
        "payment_intent_id": payment_intent_id or None,
    }


def retrieve_checkout_session(session_id: str) -> dict[str, Any]:
    """Fetch a checkout session from PayMongo (server-side, secret key). Used to
    actively reconcile a payment when the guest returns, so confirmation never
    depends solely on the async webhook. Raises :class:`PayMongoError` on failure."""
    session_id = str(session_id or "").strip()
    if not session_id:
        raise PayMongoError("Missing checkout session id.")
    base = str(settings.paymongo_base_url or "https://api.paymongo.com").rstrip("/")
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(
                f"{base}/v1/checkout_sessions/{session_id}",
                headers={"Authorization": _auth_header()},
            )
    except httpx.HTTPError as exc:
        raise PayMongoError(f"PayMongo request failed: {exc}") from exc
    if response.status_code >= 400:
        raise PayMongoError(f"PayMongo error {response.status_code}: {response.text[:500]}")
    return response.json()


def extract_checkout_payment(body: dict[str, Any]) -> tuple[bool, str | None]:
    """Read a retrieved checkout-session payload and report ``(is_paid, payment_id)``.
    A session is paid when any attached payment is ``paid`` (or the payment intent
    reached ``succeeded``)."""
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    attrs = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}

    payments = attrs.get("payments") if isinstance(attrs.get("payments"), list) else []
    for payment in payments:
        if not isinstance(payment, dict):
            continue
        pay_attrs = payment.get("attributes") if isinstance(payment.get("attributes"), dict) else {}
        if str(pay_attrs.get("status") or "").lower() == "paid":
            return True, str(payment.get("id") or "") or None

    intent = attrs.get("payment_intent") if isinstance(attrs.get("payment_intent"), dict) else {}
    intent_attrs = intent.get("attributes") if isinstance(intent.get("attributes"), dict) else {}
    if str(intent_attrs.get("status") or "").lower() in {"succeeded", "paid"}:
        return True, str(intent.get("id") or "") or None

    return False, None


def verify_webhook_signature(*, raw_body: bytes, signature_header: str) -> bool:
    """Verify a PayMongo webhook signature header against the raw request body.

    PayMongo sends ``Paymongo-Signature: t=<ts>,te=<sig>`` (test) / ``,li=<sig>``
    (live). The signature is HMAC-SHA256 of ``"{t}.{raw_body}"`` keyed by the
    webhook secret. Returns True if the secret is unset (caller decides policy)
    or the signature matches.
    """
    secret = str(settings.paymongo_webhook_secret or "").strip()
    if not secret:
        return True  # not configured → don't hard-fail (dev); caller may warn

    parts = dict(
        piece.split("=", 1)
        for piece in str(signature_header or "").split(",")
        if "=" in piece
    )
    timestamp = parts.get("t", "")
    provided = parts.get("te") or parts.get("li") or ""
    if not timestamp or not provided:
        return False

    signed_payload = f"{timestamp}.{raw_body.decode('utf-8', errors='replace')}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, provided)
