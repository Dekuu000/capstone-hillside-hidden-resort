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


def _unit_row(*, is_active: bool = True) -> dict:
    return {
        "unit_id": "unit-1",
        "name": "Poolside Cottage",
        "type": "cottage",
        "description": "Test unit",
        "base_price": 1500,
        "capacity": 4,
        "is_active": is_active,
        "image_url": None,
        "image_urls": [],
        "amenities": ["wifi"],
        "created_at": None,
        "updated_at": None,
    }


def test_units_list_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    response = client.get("/v2/units", headers=_token_header("guest-token"))
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_units_list_passes_filters(monkeypatch) -> None:
    captured: dict = {}

    def fake_list_units_admin(**kwargs):
        captured.update(kwargs)
        return ([_unit_row()], 1)

    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.units.list_units_admin", fake_list_units_admin)

    response = client.get(
        "/v2/units?limit=12&offset=24&unit_type=cottage&is_active=true&search=pool",
        headers=_token_header("admin-token"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["limit"] == 12
    assert payload["offset"] == 24
    assert payload["has_more"] is False
    assert payload["items"][0]["unit_id"] == "unit-1"
    assert captured == {
        "limit": 12,
        "offset": 24,
        "unit_type": "cottage",
        "is_active": True,
        "search": "pool",
    }


def test_get_unit_by_id_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.units.get_unit_by_id", lambda **_: _unit_row())

    response = client.get(
        "/v2/units/unit-1",
        headers=_token_header("admin-token"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["unit_id"] == "unit-1"
    assert payload["name"] == "Poolside Cottage"


def test_get_unit_by_id_not_found(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.units.get_unit_by_id", lambda **_: None)

    response = client.get(
        "/v2/units/unit-404",
        headers=_token_header("admin-token"),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Unit not found"


def test_patch_unit_status_not_found(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.units.update_unit_status", lambda **_: None)

    response = client.patch(
        "/v2/units/unit-404/status",
        headers=_token_header("admin-token"),
        json={"is_active": False},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Unit not found"


def test_patch_unit_status_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.units.update_unit_status",
        lambda **_: _unit_row(is_active=False),
    )

    response = client.patch(
        "/v2/units/unit-1/status",
        headers=_token_header("admin-token"),
        json={"is_active": False},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["unit"]["unit_id"] == "unit-1"
    assert payload["unit"]["is_active"] is False


def test_create_unit_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.units.create_unit",
        lambda **_: _unit_row(),
    )

    response = client.post(
        "/v2/units",
        headers=_token_header("admin-token"),
        json={
            "name": "Poolside Cottage",
            "type": "cottage",
            "description": "Test unit",
            "base_price": 1500,
            "capacity": 4,
            "is_active": True,
            "image_url": None,
            "image_urls": [],
            "amenities": ["wifi"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["unit"]["unit_id"] == "unit-1"


def test_patch_unit_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.units.update_unit",
        lambda **_: _unit_row(),
    )

    response = client.patch(
        "/v2/units/unit-1",
        headers=_token_header("admin-token"),
        json={"description": "Updated description"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["unit"]["unit_id"] == "unit-1"


def test_delete_unit_soft_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.units.soft_delete_unit",
        lambda **_: {"unit_id": "unit-1", "is_active": False},
    )

    response = client.delete(
        "/v2/units/unit-1",
        headers=_token_header("admin-token"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["unit_id"] == "unit-1"
    assert payload["is_active"] is False
