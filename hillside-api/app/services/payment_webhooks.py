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
    provider_payment_id: str | None = None
    amount_centavos: int | None = None
    raw_payload: dict[str, Any] | None = None


def _normalize_event_type(event_type: str) -> str:
    event = event_type.strip().lower().replace(" ", "_")
    if event in {"invoice.paid", "invoice_paid", "paid"}:
        return "payment.succeeded"
    if event in {"invoice.expired", "invoice_failed", "failed", "expired"}:
        return "payment.failed"
    # PayMongo hosted-checkout / payment events.
    if event in {"checkout_session.payment.paid", "payment.paid"}:
        return "payment.succeeded"
    if event in {"checkout_session.payment.failed", "payment.failed"}:
        return "payment.failed"
    if event in {"payment.succeeded", "payment.verified", "payment.rejected"}:
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


def _parse_paymongo_payload(payload: dict[str, Any]) -> NormalizedPaymentWebhook:
    # PayMongo: { data: { id: evt_..., attributes: { type, data: { id, attributes: {...} } } } }
    envelope = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    env_attrs = envelope.get("attributes") if isinstance(envelope.get("attributes"), dict) else {}
    event_id = str(envelope.get("id") or "").strip()
    event_name = str(env_attrs.get("type") or "").strip()

    resource = env_attrs.get("data") if isinstance(env_attrs.get("data"), dict) else {}
    res_attrs = resource.get("attributes") if isinstance(resource.get("attributes"), dict) else {}
    resource_type = str(resource.get("type") or "").strip().lower()

    metadata = res_attrs.get("metadata") if isinstance(res_attrs.get("metadata"), dict) else {}

    # The actual PayMongo payment id + amount: for a checkout_session resource it
    # lives under attributes.payments[0]; for a payment resource it's the resource.
    provider_payment_id = ""
    amount_centavos: int | None = None
    payments = res_attrs.get("payments")
    if isinstance(payments, list) and payments:
        first = payments[0] if isinstance(payments[0], dict) else {}
        provider_payment_id = str(first.get("id") or "").strip()
        pay_attrs = first.get("attributes") if isinstance(first.get("attributes"), dict) else {}
        if isinstance(pay_attrs.get("amount"), (int, float)):
            amount_centavos = int(pay_attrs["amount"])
    elif resource_type == "payment":
        provider_payment_id = str(resource.get("id") or "").strip()
        if isinstance(res_attrs.get("amount"), (int, float)):
            amount_centavos = int(res_attrs["amount"])

    reference_no = str(
        metadata.get("reference_no")
        or res_attrs.get("reference_number")
        or ""
    ).strip()
    reason = str(env_attrs.get("last_payment_error") or res_attrs.get("failed_message") or "Payment failed").strip()

    return NormalizedPaymentWebhook(
        provider="paymongo",
        event_id=event_id,
        event_type=_normalize_event_type(event_name),
        payment_id=str(metadata.get("payment_id") or "").strip() or None,
        reservation_id=str(metadata.get("reservation_id") or "").strip() or None,
        reference_no=reference_no or None,
        reason=reason,
        provider_payment_id=provider_payment_id or None,
        amount_centavos=amount_centavos,
        raw_payload=payload,
    )


def _looks_like_paymongo(payload: dict[str, Any], *, request: Request) -> bool:
    if str(request.headers.get("paymongo-signature") or "").strip():
        return True
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    attrs = data.get("attributes") if isinstance(data.get("attributes"), dict) else {}
    event_type = str(attrs.get("type") or "")
    return event_type.startswith("checkout_session.") or event_type.startswith("payment.")


def parse_payment_webhook_payload(payload: dict[str, Any], *, request: Request) -> NormalizedPaymentWebhook:
    if _looks_like_paymongo(payload, request=request):
        return _parse_paymongo_payload(payload)

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
