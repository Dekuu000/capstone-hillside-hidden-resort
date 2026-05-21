from __future__ import annotations

import hmac
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request, status

from app.core.config import settings


@dataclass(slots=True)
class NormalizedPaymentWebhook:
    provider: str
    event_id: str
    event_type: str
    payment_id: str | None = None
    reservation_id: str | None = None
    reference_no: str | None = None
    reason: str | None = None
    raw_payload: dict[str, Any] | None = None


def _normalize_event_type(event_type: str) -> str:
    event = event_type.strip().lower().replace(" ", "_")
    if event in {"invoice.paid", "invoice_paid", "paid"}:
        return "payment.succeeded"
    if event in {"invoice.expired", "invoice_failed", "failed", "expired"}:
        return "payment.failed"
    if event in {"payment.succeeded", "payment.verified", "payment.failed", "payment.rejected"}:
        return event
    if event in {"refund.succeeded", "refund.completed"}:
        return event
    return event or "unknown"


def _parse_xendit_payload(payload: dict[str, Any]) -> NormalizedPaymentWebhook:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    if isinstance(data.get("metadata"), dict):
        metadata = {**metadata, **data["metadata"]}

    event_id = str(payload.get("id") or payload.get("event_id") or data.get("id") or "").strip()
    event_name = str(payload.get("event") or payload.get("event_type") or payload.get("type") or "").strip()
    status_value = str(payload.get("status") or data.get("status") or "").strip().lower()
    if not event_name and status_value:
        event_name = status_value

    payment_id = str(
        metadata.get("payment_id")
        or payload.get("payment_id")
        or data.get("payment_id")
        or payload.get("payment_request_id")
        or data.get("payment_request_id")
        or ""
    ).strip()
    reservation_id = str(
        metadata.get("reservation_id")
        or payload.get("reservation_id")
        or data.get("reservation_id")
        or ""
    ).strip()
    reference_no = str(
        metadata.get("reference_no")
        or payload.get("external_id")
        or data.get("external_id")
        or payload.get("reference_no")
        or data.get("reference_no")
        or ""
    ).strip()
    reason = str(
        payload.get("failure_reason")
        or data.get("failure_reason")
        or payload.get("description")
        or "Webhook rejection"
    ).strip()

    return NormalizedPaymentWebhook(
        provider="xendit",
        event_id=event_id,
        event_type=_normalize_event_type(event_name),
        payment_id=payment_id or None,
        reservation_id=reservation_id or None,
        reference_no=reference_no or None,
        reason=reason,
        raw_payload=payload,
    )


def _parse_generic_payload(payload: dict[str, Any]) -> NormalizedPaymentWebhook:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    event_id = str(payload.get("event_id") or payload.get("id") or data.get("event_id") or data.get("id") or "").strip()
    event_type = str(payload.get("event_type") or payload.get("type") or data.get("event_type") or "").strip()
    payment_id = str(payload.get("payment_id") or data.get("payment_id") or "").strip()
    reservation_id = str(payload.get("reservation_id") or data.get("reservation_id") or "").strip()
    reference_no = str(payload.get("reference_no") or data.get("reference_no") or "").strip()
    reason = str(payload.get("reason") or data.get("reason") or "Webhook rejection").strip()
    provider = str(payload.get("provider") or "generic").strip().lower() or "generic"
    return NormalizedPaymentWebhook(
        provider=provider,
        event_id=event_id,
        event_type=_normalize_event_type(event_type),
        payment_id=payment_id or None,
        reservation_id=reservation_id or None,
        reference_no=reference_no or None,
        reason=reason,
        raw_payload=payload,
    )


def parse_payment_webhook_payload(payload: dict[str, Any], *, request: Request) -> NormalizedPaymentWebhook:
    xendit_header = str(request.headers.get("x-callback-token") or "").strip()
    provider_hint = str(payload.get("provider") or "").strip().lower()

    is_xendit_payload = bool(
        xendit_header
        or provider_hint == "xendit"
        or "external_id" in payload
        or (isinstance(payload.get("data"), dict) and "external_id" in payload["data"])
    )
    if is_xendit_payload:
        return _parse_xendit_payload(payload)
    return _parse_generic_payload(payload)


def verify_webhook_signature(*, request: Request, provider: str) -> None:
    if provider == "xendit":
        expected_token = str(settings.xendit_callback_token or "").strip()
        if expected_token:
            incoming_token = str(request.headers.get("x-callback-token") or "").strip()
            if not incoming_token or not hmac.compare_digest(incoming_token, expected_token):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Xendit callback token.")
            return

    expected_secret = str(settings.payment_webhook_secret or "").strip()
    if not expected_secret:
        return
    incoming_secret = str(request.headers.get("x-webhook-secret") or "").strip()
    if not incoming_secret or not hmac.compare_digest(incoming_secret, expected_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")
