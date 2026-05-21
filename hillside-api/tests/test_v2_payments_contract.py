import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.auth import AuthContext
from app.main import app

client = TestClient(app)
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "webhooks"


def _load_fixture(name: str) -> dict:
    with (FIXTURES_DIR / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


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


def test_submit_payment_promotes_reservation_status_when_minimum_is_met(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_reservation_by_id",
        lambda _reservation_id: {
            "reservation_id": "res-1",
            "guest_user_id": "guest-user",
            "status": "for_verification",
            "amount_paid_verified": 1000,
            "deposit_required": 1000,
            "expected_pay_now": 1000,
        },
    )
    monkeypatch.setattr("app.api.v2.routes.payments.submit_payment_proof_rpc", lambda **_: "pay-123")

    response = client.post(
        "/v2/payments/submissions",
        headers=_token_header("guest-token"),
        json={
            "reservation_id": "res-1",
            "amount": 1000,
            "payment_type": "deposit",
            "method": "gcash",
            "reference_no": "REF123",
            "proof_url": "proof/path.png",
            "idempotency_key": "idem-min-ok",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_status"] == "confirmed"


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


def test_submit_payment_rejects_expired_pending_payment_hold(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_reservation_by_id",
        lambda _: {
            "reservation_id": "res-1",
            "guest_user_id": "guest-user",
            "status": "pending_payment",
            "created_at": "2026-01-01T00:00:00+00:00",
            "amount_paid_verified": 0,
            "deposit_required": 500,
            "expected_pay_now": 500,
        },
    )
    monkeypatch.setattr(
        "app.api.v2.routes.payments.expire_pending_payment_hold_for_reservation",
        lambda **_: True,
    )

    response = client.post(
        "/v2/payments/submissions",
        headers=_token_header("guest-token"),
        json={
            "reservation_id": "res-1",
            "amount": 500,
            "payment_type": "deposit",
            "method": "gcash",
            "reference_no": "REF123",
            "proof_url": "proof/path.png",
            "idempotency_key": "idem-expired-1",
        },
    )
    assert response.status_code == 409
    assert "payment window has expired" in response.json()["detail"].lower()


def test_payment_webhook_rejects_invalid_secret(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_mode", "gateway")
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_webhook_secret", "expected-secret")

    response = client.post(
        "/v2/payments/webhooks/provider",
        json={"event_id": "evt-1", "event_type": "payment.succeeded", "payment_id": "pay-1"},
    )
    assert response.status_code == 401


def test_xendit_webhook_rejects_invalid_callback_token(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_mode", "gateway")
    monkeypatch.setattr("app.api.v2.routes.payments.settings.xendit_callback_token", "expected-callback-token")
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_webhook_secret", "")

    response = client.post(
        "/v2/payments/webhooks/provider",
        json=_load_fixture("xendit_invoice_paid.json"),
        headers={"x-callback-token": "wrong-token"},
    )
    assert response.status_code == 401
    assert "callback token" in response.json()["detail"].lower()


def test_payment_webhook_verifies_payment_and_dedupes(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_mode", "gateway")
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_webhook_secret", "")
    monkeypatch.setattr("app.api.v2.routes.payments.verify_payment_service_role", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("app.api.v2.routes.payments.load_cached_response_payload", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.payments.store_operation_receipt_safely", lambda **_: None)

    response = client.post(
        "/v2/payments/webhooks/provider",
        json={
            "provider": "mock",
            "event_id": "evt-1",
            "event_type": "payment.succeeded",
            "payment_id": "pay-1",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["processed"] == "payment_verified"

    monkeypatch.setattr(
        "app.api.v2.routes.payments.load_cached_response_payload",
        lambda **_: {"processed": "payment_verified"},
    )
    dedupe = client.post(
        "/v2/payments/webhooks/provider",
        json={
            "provider": "mock",
            "event_id": "evt-1",
            "event_type": "payment.succeeded",
            "payment_id": "pay-1",
        },
    )
    assert dedupe.status_code == 200
    dedupe_payload = dedupe.json()
    assert dedupe_payload["ok"] is True
    assert dedupe_payload["deduped"] is True


def test_xendit_webhook_links_by_reference_and_verifies(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_mode", "gateway")
    monkeypatch.setattr("app.api.v2.routes.payments.settings.xendit_callback_token", "expected-callback-token")
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_webhook_secret", "")
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_payment_by_reference_no",
        lambda **_: {"payment_id": "pay-ref-1", "reservation_id": "res-1"},
    )
    called: dict[str, str] = {}

    def _mark_verified(payment_id: str, *, approved: bool = True) -> None:
        called["payment_id"] = payment_id
        called["approved"] = str(approved)

    monkeypatch.setattr("app.api.v2.routes.payments.verify_payment_service_role", _mark_verified)
    monkeypatch.setattr("app.api.v2.routes.payments.load_cached_response_payload", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.payments.store_operation_receipt_safely", lambda **_: None)

    response = client.post(
        "/v2/payments/webhooks/provider",
        json=_load_fixture("xendit_invoice_paid.json"),
        headers={"x-callback-token": "expected-callback-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["provider"] == "xendit"
    assert payload["processed"] == "payment_verified"
    assert payload["payment_id"] == "pay-ref-1"
    assert payload["reservation_id"] == "res-1"
    assert payload["dedupe_result"] == "processed"
    assert called["payment_id"] == "pay-ref-1"


def test_xendit_webhook_links_by_reference_and_rejects(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_mode", "gateway")
    monkeypatch.setattr("app.api.v2.routes.payments.settings.xendit_callback_token", "expected-callback-token")
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_webhook_secret", "")
    monkeypatch.setattr(
        "app.api.v2.routes.payments.get_payment_by_reference_no",
        lambda **_: {"payment_id": "pay-ref-2", "reservation_id": "res-2"},
    )
    called: dict[str, str] = {}

    def _mark_rejected(payment_id: str, *, reason: str) -> None:
        called["payment_id"] = payment_id
        called["reason"] = reason

    monkeypatch.setattr("app.api.v2.routes.payments.reject_payment_service_role", _mark_rejected)
    monkeypatch.setattr("app.api.v2.routes.payments.load_cached_response_payload", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.payments.store_operation_receipt_safely", lambda **_: None)

    response = client.post(
        "/v2/payments/webhooks/provider",
        json=_load_fixture("xendit_invoice_expired.json"),
        headers={"x-callback-token": "expected-callback-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["provider"] == "xendit"
    assert payload["processed"] == "payment_rejected"
    assert payload["payment_id"] == "pay-ref-2"
    assert called["payment_id"] == "pay-ref-2"


def test_payment_webhook_disabled_in_proof_only_mode(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v2.routes.payments.settings.payment_mode", "proof_only")
    response = client.post(
        "/v2/payments/webhooks/provider",
        json={"event_id": "evt-proof-only", "event_type": "payment.succeeded", "payment_id": "pay-1"},
    )
    assert response.status_code == 409
    assert "proof-only mode" in response.json()["detail"].lower()
