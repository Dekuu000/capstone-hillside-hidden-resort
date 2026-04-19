from app.services.idempotency import build_idempotency_operation_id
from app.services import idempotency as idempotency_service


def test_build_idempotency_operation_id_is_deterministic() -> None:
    first = build_idempotency_operation_id(
        route_key="payments.submissions.create",
        user_id="user-1",
        idempotency_key="idem-123",
    )
    second = build_idempotency_operation_id(
        route_key="payments.submissions.create",
        user_id="user-1",
        idempotency_key="idem-123",
    )
    assert first == second


def test_build_idempotency_operation_id_changes_with_key() -> None:
    base = build_idempotency_operation_id(
        route_key="reservations.create",
        user_id="user-1",
        idempotency_key="idem-a",
    )
    changed = build_idempotency_operation_id(
        route_key="reservations.create",
        user_id="user-1",
        idempotency_key="idem-b",
    )
    assert base != changed


def test_build_idempotency_operation_id_uses_route_prefix() -> None:
    operation_id = build_idempotency_operation_id(
        route_key="operations.checkins.create",
        user_id="admin-1",
        idempotency_key="idem-ops-1",
    )
    assert operation_id.startswith("operations.checkins.create:")
    assert len(operation_id.split(":", maxsplit=1)[1]) == 40


def test_load_cached_response_payload_returns_response_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        idempotency_service,
        "get_sync_operation_receipt",
        lambda **_: {"response_payload": {"ok": True, "value": "cached"}},
    )
    payload = idempotency_service.load_cached_response_payload(
        operation_id="op-1",
        user_id="user-1",
        idempotency_key="idem-1",
        logger=idempotency_service.logging.getLogger("test"),
        warning_label="Unit test",
    )
    assert payload == {"ok": True, "value": "cached"}


def test_store_operation_receipt_safely_swallows_runtime_error(monkeypatch) -> None:
    monkeypatch.setattr(
        idempotency_service,
        "upsert_sync_operation_receipt",
        lambda **_: (_ for _ in ()).throw(RuntimeError("db unavailable")),
    )
    # Should not raise
    idempotency_service.store_operation_receipt_safely(
        operation_id="op-1",
        idempotency_key="idem-1",
        user_id="user-1",
        entity_type="checkin",
        entity_id="res-1",
        action="operations.checkins.create",
        response_payload={"ok": True},
        logger=idempotency_service.logging.getLogger("test"),
        warning_label="Unit test",
    )
