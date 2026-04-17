from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api.v2.routes import sync as sync_routes
from app.core.auth import AuthContext
from app.main import app
from app.schemas.common import OfflineOperation

client = TestClient(app)


def _token_header(value: str = "token") -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}


def _mock_guest_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="guest-user",
        email="guest@example.com",
        role="guest",
        access_token="guest-token",
    )


def _mock_admin_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="admin-user",
        email="admin@example.com",
        role="admin",
        access_token="admin-token",
    )


def _operation_payload(
    *,
    operation_id: str = "op-1",
    idempotency_key: str = "idem-1",
    entity_type: str = "checkin",
    action: str = "checkin.perform",
    entity_id: str | None = "res-1",
    payload: dict | None = None,
) -> dict:
    return {
        "operation_id": operation_id,
        "idempotency_key": idempotency_key,
        "entity_type": entity_type,
        "action": action,
        "entity_id": entity_id,
        "payload": payload or {"reservation_id": "res-1"},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "retry_count": 0,
    }


def test_sync_push_exactly_once_replay(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)

    receipts: dict[str, dict] = {}
    apply_calls: list[str] = []

    def fake_get_receipt(*, operation_id: str, user_id: str, idempotency_key: str):
        row = receipts.get(operation_id)
        if row and row.get("user_id") == user_id and row.get("idempotency_key") == idempotency_key:
            return row
        return None

    def fake_upsert_sync_operation_receipt(**kwargs):
        row = {
            **kwargs,
            "operation_id": kwargs["operation_id"],
            "idempotency_key": kwargs["idempotency_key"],
            "entity_type": kwargs["entity_type"],
            "action": kwargs["action"],
            "status": kwargs["status"],
            "http_status": kwargs["http_status"],
            "response_payload": kwargs.get("response_payload") or {},
            "user_id": kwargs["user_id"],
        }
        receipts[kwargs["operation_id"]] = row
        return row

    def fake_apply_operation(op, _auth):
        apply_calls.append(op.operation_id)
        return "res-1", {"status": "checked_in", "reservation_id": "res-1"}

    monkeypatch.setattr("app.api.v2.routes.sync.get_sync_operation_receipt", fake_get_receipt)
    monkeypatch.setattr("app.api.v2.routes.sync.upsert_sync_operation_receipt", fake_upsert_sync_operation_receipt)
    monkeypatch.setattr("app.api.v2.routes.sync._apply_operation", fake_apply_operation)
    monkeypatch.setattr("app.api.v2.routes.sync.cleanup_sync_operation_receipts", lambda retention_hours: None)

    body = {"scope": "admin", "operations": [_operation_payload()]}
    first = client.post("/v2/sync/push", headers=_token_header("admin-token"), json=body)
    second = client.post("/v2/sync/push", headers=_token_header("admin-token"), json=body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["applied"] == 1
    assert second.json()["applied"] == 1
    assert len(apply_calls) == 1


def test_sync_push_reports_conflict_and_failure(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.sync.get_sync_operation_receipt", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.sync.cleanup_sync_operation_receipts", lambda retention_hours: None)

    def fake_upsert_sync_operation_receipt(**kwargs):
        return {
            "operation_id": kwargs["operation_id"],
            "idempotency_key": kwargs["idempotency_key"],
            "entity_type": kwargs["entity_type"],
            "action": kwargs["action"],
            "status": kwargs["status"],
            "http_status": kwargs["http_status"],
            "conflict": kwargs.get("conflict", False),
            "resolution_hint": kwargs.get("resolution_hint"),
            "error_message": kwargs.get("error_message"),
            "response_payload": kwargs.get("response_payload") or {},
        }

    def fake_apply_operation(op, _auth):
        if op.operation_id == "op-conflict":
            raise RuntimeError("Reservation already checked in.")
        raise RuntimeError("Malformed payload.")

    monkeypatch.setattr("app.api.v2.routes.sync.upsert_sync_operation_receipt", fake_upsert_sync_operation_receipt)
    monkeypatch.setattr("app.api.v2.routes.sync._apply_operation", fake_apply_operation)

    body = {
        "scope": "admin",
        "operations": [
            _operation_payload(operation_id="op-conflict", idempotency_key="idem-conflict"),
            _operation_payload(operation_id="op-failed", idempotency_key="idem-failed"),
        ],
    }
    response = client.post("/v2/sync/push", headers=_token_header("admin-token"), json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["conflict"] == 1
    assert payload["failed"] == 1
    result_by_id = {item["operation_id"]: item for item in payload["results"]}
    assert result_by_id["op-conflict"]["status"] == "conflict"
    assert result_by_id["op-conflict"]["http_status"] == 409
    assert result_by_id["op-failed"]["status"] == "failed"
    assert result_by_id["op-failed"]["http_status"] == 400


def test_sync_push_admin_verify_payment(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.sync.get_sync_operation_receipt", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.sync.cleanup_sync_operation_receipts", lambda retention_hours: None)

    called: dict[str, str] = {}

    def fake_verify_payment_rpc(payment_id: str, *, access_token: str, approved: bool = True):
        called["payment_id"] = payment_id
        called["access_token"] = access_token
        called["approved"] = str(approved)

    def fake_upsert_sync_operation_receipt(**kwargs):
        return {
            "operation_id": kwargs["operation_id"],
            "idempotency_key": kwargs["idempotency_key"],
            "entity_type": kwargs["entity_type"],
            "action": kwargs["action"],
            "status": kwargs["status"],
            "http_status": kwargs["http_status"],
            "entity_id": kwargs.get("entity_id"),
            "response_payload": kwargs.get("response_payload") or {},
        }

    monkeypatch.setattr("app.api.v2.routes.sync.verify_payment_rpc", fake_verify_payment_rpc)
    monkeypatch.setattr("app.api.v2.routes.sync.upsert_sync_operation_receipt", fake_upsert_sync_operation_receipt)

    body = {
        "scope": "admin",
        "operations": [
            _operation_payload(
                operation_id="op-verify",
                idempotency_key="idem-verify",
                entity_type="payment_submission",
                action="payments.verify",
                entity_id="pay-123",
                payload={"payment_id": "pay-123"},
            )
        ],
    }
    response = client.post("/v2/sync/push", headers=_token_header("admin-token"), json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["applied"] == 1
    assert payload["results"][0]["status"] == "applied"
    assert payload["results"][0]["entity_id"] == "pay-123"
    assert called["payment_id"] == "pay-123"
    assert called["access_token"] == "admin-token"
    assert called["approved"] == "True"


def test_sync_push_admin_reject_payment_short_reason_fails(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.sync.get_sync_operation_receipt", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.sync.cleanup_sync_operation_receipts", lambda retention_hours: None)

    def fake_upsert_sync_operation_receipt(**kwargs):
        return {
            "operation_id": kwargs["operation_id"],
            "idempotency_key": kwargs["idempotency_key"],
            "entity_type": kwargs["entity_type"],
            "action": kwargs["action"],
            "status": kwargs["status"],
            "http_status": kwargs["http_status"],
            "error_message": kwargs.get("error_message"),
            "response_payload": kwargs.get("response_payload") or {},
        }

    monkeypatch.setattr("app.api.v2.routes.sync.upsert_sync_operation_receipt", fake_upsert_sync_operation_receipt)

    body = {
        "scope": "admin",
        "operations": [
            _operation_payload(
                operation_id="op-reject",
                idempotency_key="idem-reject",
                entity_type="payment_submission",
                action="payments.reject",
                entity_id="pay-123",
                payload={"payment_id": "pay-123", "reason": "bad"},
            )
        ],
    }
    response = client.post("/v2/sync/push", headers=_token_header("admin-token"), json=body)
    assert response.status_code == 200
    payload = response.json()
    assert payload["failed"] == 1
    assert payload["results"][0]["status"] == "failed"
    assert payload["results"][0]["http_status"] == 400
    assert "at least 5 characters" in (payload["results"][0]["error_message"] or "")


def test_apply_payment_submission_on_site_accepts_reservation_code(monkeypatch) -> None:
    auth = _mock_admin_auth("admin-token")
    called: dict[str, str] = {}

    def fake_get_by_code(code: str):
        assert code == "HR-20260316-ABCD"
        return {"reservation_id": "res-200"}

    def fake_record_on_site_payment_rpc(*, access_token: str, reservation_id: str, amount: float, method: str, reference_no: str | None):
        called["reservation_id"] = reservation_id
        called["access_token"] = access_token
        called["amount"] = str(amount)
        called["method"] = method
        called["reference_no"] = reference_no or ""
        return "pay-200"

    monkeypatch.setattr("app.api.v2.routes.sync.get_reservation_by_code_rpc", fake_get_by_code)
    monkeypatch.setattr("app.api.v2.routes.sync.record_on_site_payment_rpc", fake_record_on_site_payment_rpc)
    monkeypatch.setattr("app.api.v2.routes.sync.get_reservation_by_id_rpc", lambda _: {"status": "confirmed"})

    op = OfflineOperation(
        operation_id="op-onsite",
        idempotency_key="idem-onsite",
        entity_type="payment_submission",
        action="payments.on_site.create",
        entity_id="HR-20260316-ABCD",
        payload={
            "reservation_id": "HR-20260316-ABCD",
            "amount": 500,
            "method": "cash",
            "reference_no": "OR-100",
        },
        created_at=datetime.now(timezone.utc),
        retry_count=0,
    )

    entity_id, payload = sync_routes._apply_payment_submission(op, auth)
    assert entity_id == "pay-200"
    assert payload["payment_id"] == "pay-200"
    assert payload["reservation_id"] == "res-200"
    assert payload["status"] == "verified"
    assert called["reservation_id"] == "res-200"
    assert called["access_token"] == "admin-token"
    assert called["amount"] == "500.0"
    assert called["method"] == "cash"
    assert called["reference_no"] == "OR-100"

