import hashlib


def build_idempotency_operation_id(*, route_key: str, user_id: str, idempotency_key: str) -> str:
    digest = hashlib.sha256(f"{route_key}:{user_id}:{idempotency_key}".encode("utf-8")).hexdigest()
    return f"{route_key}:{digest[:40]}"
