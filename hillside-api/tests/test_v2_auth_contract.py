from fastapi.testclient import TestClient

from app.core.auth import AuthContext
from app.main import app

client = TestClient(app)


def _auth_header(token: str = "test-token") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _reservation_row(*, guest_user_id: str) -> dict:
    return {
        "reservation_id": "res-1",
        "reservation_code": "HR-TEST-001",
        "guest_user_id": guest_user_id,
        "status": "confirmed",
        "created_at": "2026-02-20T00:00:00+00:00",
        "check_in_date": "2026-02-21",
        "check_out_date": "2026-02-22",
        "total_amount": 1500,
    }


def test_reservation_detail_requires_bearer_token() -> None:
    response = client.get("/v2/reservations/res-1")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing Bearer token."


def test_guest_cannot_access_other_users_reservation(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.auth.verify_access_token",
        lambda _: AuthContext(
            user_id="guest-user",
            email="guest@example.com",
            role="guest",
            access_token="test-token",
        ),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_reservation_by_id",
        lambda _: _reservation_row(guest_user_id="another-user"),
    )

    response = client.get("/v2/reservations/res-1", headers=_auth_header())
    assert response.status_code == 403
    assert response.json()["detail"] == "You are not allowed to access this reservation."


def test_guest_can_access_own_reservation(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.auth.verify_access_token",
        lambda _: AuthContext(
            user_id="guest-user",
            email="guest@example.com",
            role="guest",
            access_token="test-token",
        ),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_reservation_by_id",
        lambda _: _reservation_row(guest_user_id="guest-user"),
    )

    response = client.get("/v2/reservations/res-1", headers=_auth_header())
    assert response.status_code == 200
    assert response.json()["reservation_id"] == "res-1"


def test_reservations_list_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.auth.verify_access_token",
        lambda _: AuthContext(
            user_id="guest-user",
            email="guest@example.com",
            role="guest",
            access_token="test-token",
        ),
    )

    response = client.get("/v2/reservations", headers=_auth_header())
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."
