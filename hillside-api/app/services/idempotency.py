import hashlib
import logging
from typing import Any

from app.integrations.supabase_client import get_sync_operation_receipt, upsert_sync_operation_receipt

def build_idempotency_operation_id(*, route_key: str, user_id: str, idempotency_key: str) -> str:
    digest = hashlib.sha256(f"{route_key}:{user_id}:{idempotency_key}".encode("utf-8")).hexdigest()
    return f"{route_key}:{digest[:40]}"


def load_cached_response_payload(
    *,
    operation_id: str,
    user_id: str,
    idempotency_key: str,
    logger: logging.Logger,
    warning_label: str,
) -> dict[str, Any] | None:
    try:
        receipt = get_sync_operation_receipt(
            operation_id=operation_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
    except RuntimeError:
        logger.warning("%s idempotency replay lookup skipped (user_id=%s)", warning_label, user_id)
        return None
    if receipt and isinstance(receipt.get("response_payload"), dict):
        payload = receipt["response_payload"]
        if isinstance(payload, dict):
            return payload
    return None


def store_operation_receipt_safely(
    *,
    operation_id: str,
    idempotency_key: str,
    user_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    response_payload: dict[str, Any],
    logger: logging.Logger,
    warning_label: str,
    http_status: int = 200,
) -> None:
    try:
        upsert_sync_operation_receipt(
            operation_id=operation_id,
            idempotency_key=idempotency_key,
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            status="applied",
            http_status=http_status,
            response_payload=response_payload,
        )
    except RuntimeError:
        logger.warning("%s idempotency receipt store skipped (user_id=%s)", warning_label, user_id)
