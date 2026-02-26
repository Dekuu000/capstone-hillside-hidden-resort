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


def _header() -> dict[str, str]:
    return {"Authorization": "Bearer guest-token"}


def _reservation_row() -> dict:
    return {
        "reservation_id": "res-1",
        "reservation_code": "HR-TEST-001",
        "status": "pending_payment",
        "created_at": "2026-02-20T00:00:00+00:00",
        "check_in_date": "2026-02-21",
        "check_out_date": "2026-02-22",
        "total_amount": 1500,
    }


def test_me_reservations_requires_auth() -> None:
    response = client.get("/v2/me/reservations")
    assert response.status_code == 401


def test_me_reservations_returns_user_scoped_rows(monkeypatch) -> None:
    captured: dict = {}
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)

    def fake_list_my_reservations(**kwargs):
        captured.update(kwargs)
        return ([_reservation_row()], 1)

    monkeypatch.setattr(
        "app.api.v2.routes.me.list_my_reservations",
        fake_list_my_reservations,
    )

    response = client.get(
        "/v2/me/reservations?limit=25&offset=0&status=pending_payment&search=HR-TEST",
        headers=_header(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["items"][0]["reservation_id"] == "res-1"
    assert payload["has_more"] is False
    assert captured["user_id"] == "guest-user"
    assert captured["status_filter"] == "pending_payment"
    assert captured["search"] == "HR-TEST"
