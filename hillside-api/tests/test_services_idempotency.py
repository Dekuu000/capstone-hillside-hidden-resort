from app.services.idempotency import build_idempotency_operation_id


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
