from fastapi.testclient import TestClient

from app.core.auth import AuthContext
from app.main import app

client = TestClient(app)


def _guest_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="guest-user",
        email="guest@example.com",
        role="guest",
        access_token="guest-token",
    )


def _admin_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="admin-user",
        email="admin@example.com",
        role="admin",
        access_token="admin-token",
    )


def _header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_operations_forbidden_error_has_standard_envelope(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    response = client.post(
        "/v2/checkins",
        json={"reservation_id": "res-1"},
        headers=_header("guest-token"),
    )
    assert response.status_code == 403
    payload = response.json()
    assert payload["detail"] == "Admin access required."
    assert payload["code"] == "forbidden"
    assert isinstance(payload["context"], dict)


def test_reservations_validation_error_has_standard_envelope(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    response = client.post(
        "/v2/reservations",
        headers=_header("guest-token"),
        json={
            "check_in_date": "2026-04-25",
            "check_out_date": "2026-04-24",
            "unit_ids": ["unit-1"],
            "guest_count": 1,
            "idempotency_key": "idem-test",
        },
    )
    assert response.status_code == 422
    payload = response.json()
    assert payload["detail"] == "check_out_date must be after check_in_date."
    assert payload["code"] == "unprocessable_content"
    assert isinstance(payload["context"], dict)


def test_payments_runtime_error_has_standard_envelope(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.payments.list_admin_payments",
        lambda **_: (_ for _ in ()).throw(RuntimeError("Supabase not configured")),
    )
    response = client.get("/v2/payments", headers=_header("admin-token"))
    assert response.status_code == 503
    payload = response.json()
    assert payload["detail"] == "Supabase not configured"
    assert payload["code"] == "service_unavailable"
    assert isinstance(payload["context"], dict)
