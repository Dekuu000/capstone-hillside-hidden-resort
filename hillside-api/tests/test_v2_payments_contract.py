from fastapi.testclient import TestClient

from app.core.auth import AuthContext
from app.main import app

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


def _admin_payment_row() -> dict:
    return {
        "payment_id": "pay-1",
        "reservation_id": "res-1",
        "payment_type": "deposit",
        "amount": 500,
        "method": "gcash",
        "reference_no": "REF-123",
        "proof_url": "proof/path.png",
        "status": "pending",
        "reservation": {
            "reservation_code": "HR-TEST-001",
            "status": "for_verification",
            "total_amount": 1500,
            "deposit_required": 500,
            "guest": {"name": "Guest", "email": "guest@example.com"},
        },
    }


def test_payments_list_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    response = client.get("/v2/payments", headers=_token_header("guest-token"))
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_payments_list_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.list_admin_payments",
        lambda **_: ([_admin_payment_row()], 1),
    )

    response = client.get(
        "/v2/payments?tab=to_review&limit=10&offset=0",
        headers=_token_header("admin-token"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["limit"] == 10
    assert payload["offset"] == 0
    assert payload["has_more"] is False
    assert payload["items"][0]["payment_id"] == "pay-1"


def test_reservation_payments_blocks_non_owner_guest(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_reservation_by_id",
        lambda _: {"reservation_id": "res-1", "guest_user_id": "another-user"},
    )

    response = client.get(
        "/v2/payments/reservations/res-1",
        headers=_token_header("guest-token"),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "You are not allowed to access this reservation."


def test_reservation_payments_allows_owner_guest(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_reservation_by_id",
        lambda _: {"reservation_id": "res-1", "guest_user_id": "guest-user"},
    )
    monkeypatch.setattr(
        "app.api.v2.routes.payments.list_payments_by_reservation",
        lambda **_: (
            [{"payment_id": "pay-1", "reservation_id": "res-1", "status": "pending"}],
            1,
        ),
    )

    response = client.get(
        "/v2/payments/reservations/res-1",
        headers=_token_header("guest-token"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["items"][0]["payment_id"] == "pay-1"


def test_submit_payment_blocks_non_owner(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_reservation_by_id",
        lambda _: {"reservation_id": "res-1", "guest_user_id": "another-user", "status": "pending_payment"},
    )

    response = client.post(
        "/v2/payments/submissions",
        headers=_token_header("guest-token"),
        json={
            "reservation_id": "res-1",
            "amount": 100,
            "payment_type": "deposit",
            "method": "gcash",
            "reference_no": "REF123",
            "proof_url": "proof/path.png",
            "idempotency_key": "idem-1",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "You are not allowed to access this reservation."


def test_submit_payment_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_reservation_by_id",
        lambda _: {"reservation_id": "res-1", "guest_user_id": "guest-user", "status": "pending_payment"},
    )
    monkeypatch.setattr("app.api.v2.routes.payments.submit_payment_proof_rpc", lambda **_: "pay-123")

    response = client.post(
        "/v2/payments/submissions",
        headers=_token_header("guest-token"),
        json={
            "reservation_id": "res-1",
            "amount": 100,
            "payment_type": "deposit",
            "method": "gcash",
            "reference_no": "REF123",
            "proof_url": "proof/path.png",
            "idempotency_key": "idem-1",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["payment_id"] == "pay-123"
    assert payload["status"] == "pending"
    assert payload["reservation_status"] == "for_verification"


def test_submit_payment_requires_proof_url(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)

    response = client.post(
        "/v2/payments/submissions",
        headers=_token_header("guest-token"),
        json={
            "reservation_id": "res-1",
            "amount": 100,
            "payment_type": "deposit",
            "method": "gcash",
            "reference_no": "REF123",
            "proof_url": None,
            "idempotency_key": "idem-1",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "proof_url is required."


def test_update_payment_intent_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_reservation_by_id",
        lambda _: {"reservation_id": "res-1", "guest_user_id": "guest-user", "status": "pending_payment"},
    )
    called: dict = {}

    def fake_update(**kwargs):
        called.update(kwargs)

    monkeypatch.setattr("app.api.v2.routes.payments.update_payment_intent_amount_rpc", fake_update)

    response = client.post(
        "/v2/payments/intent",
        headers=_token_header("guest-token"),
        json={"reservation_id": "res-1", "amount": 250},
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert called["reservation_id"] == "res-1"
    assert called["amount"] == 250


def test_on_site_payment_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)

    response = client.post(
        "/v2/payments/on-site",
        headers=_token_header("guest-token"),
        json={
            "reservation_id": "res-1",
            "amount": 250,
            "method": "cash",
            "reference_no": None,
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_on_site_payment_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_reservation_by_id",
        lambda _: {"reservation_id": "res-1", "status": "pending_payment"},
    )
    monkeypatch.setattr(
        "app.api.v2.routes.payments.record_on_site_payment_rpc",
        lambda **_: "pay-onsite-1",
    )

    response = client.post(
        "/v2/payments/on-site",
        headers=_token_header("admin-token"),
        json={
            "reservation_id": "res-1",
            "amount": 250,
            "method": "cash",
            "reference_no": "OR-001",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["payment_id"] == "pay-onsite-1"
    assert payload["status"] == "verified"
    assert payload["reservation_status"] == "pending_payment"
