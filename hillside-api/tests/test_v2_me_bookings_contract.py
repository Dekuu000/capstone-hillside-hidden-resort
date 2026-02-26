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
        "status": "confirmed",
        "created_at": "2026-02-20T00:00:00+00:00",
        "check_in_date": "2026-02-21",
        "check_out_date": "2026-02-22",
        "total_amount": 1500,
        "units": [],
        "service_bookings": [],
    }


def test_me_bookings_requires_auth() -> None:
    response = client.get("/v2/me/bookings")
    assert response.status_code == 401


def test_me_bookings_contract(monkeypatch) -> None:
    captured: dict = {}
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)

    def fake_list_my_bookings(**kwargs):
        captured.update(kwargs)
        return {
            "items": [_reservation_row()],
            "nextCursor": {"createdAt": "2026-02-19T00:00:00+00:00", "reservationId": "res-1", "checkInDate": "2026-02-20"},
            "totalCount": 12,
        }

    monkeypatch.setattr("app.api.v2.routes.me.list_my_bookings", fake_list_my_bookings)

    response = client.get(
        "/v2/me/bookings?tab=upcoming&limit=10&search=HR&cursor_created_at=2026-02-19T00:00:00%2B00:00&cursor_reservation_id=res-0&cursor_check_in_date=2026-02-19",
        headers=_header(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["totalCount"] == 12
    assert payload["items"][0]["reservation_id"] == "res-1"
    assert captured["user_id"] == "guest-user"
    assert captured["tab"] == "upcoming"
    assert captured["limit"] == 10
    assert captured["search"] == "HR"
    assert captured["cursor"]["created_at"] == "2026-02-19T00:00:00+00:00"
    assert captured["cursor"]["reservation_id"] == "res-0"
    assert captured["cursor"]["check_in_date"] == "2026-02-19"


def test_me_booking_details_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)

    def fake_get_my_booking_details(**kwargs):
        assert kwargs["user_id"] == "guest-user"
        assert kwargs["reservation_id"] == "res-123"
        return {
            "reservation_id": "res-123",
            "reservation_code": "HR-DETAIL-001",
            "status": "confirmed",
            "created_at": "2026-02-20T00:00:00+00:00",
            "check_in_date": "2026-02-21",
            "check_out_date": "2026-02-22",
            "total_amount": 1500,
            "units": [],
            "service_bookings": [],
            "payments": [],
        }

    monkeypatch.setattr("app.api.v2.routes.me.get_my_booking_details", fake_get_my_booking_details)

    response = client.get("/v2/me/bookings/res-123", headers=_header())
    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_id"] == "res-123"
    assert payload["reservation_code"] == "HR-DETAIL-001"


def test_me_booking_details_not_found(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    monkeypatch.setattr("app.api.v2.routes.me.get_my_booking_details", lambda **_: None)

    response = client.get("/v2/me/bookings/missing-id", headers=_header())
    assert response.status_code == 404
    assert response.json()["detail"] == "Booking not found"
