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


def test_dashboard_summary_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    response = client.get("/v2/dashboard/summary", headers=_token_header("guest-token"))
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_dashboard_summary_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.dashboard.list_units_admin",
        lambda **_: ([], 12),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.dashboard.list_recent_reservations",
        lambda **kwargs: ([], 8 if kwargs.get("status_filter") == "for_verification" else 6),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.dashboard.list_admin_payments",
        lambda **_: ([], 5),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.dashboard.get_report_summary_rpc",
        lambda **_: {
            "bookings": 44,
            "cancellations": 3,
            "cash_collected": 24000,
            "occupancy_rate": 0.37,
            "unit_booked_value": 28000,
            "tour_booked_value": 6000,
        },
    )

    response = client.get(
        "/v2/dashboard/summary?from_date=2026-02-01&to_date=2026-02-07",
        headers=_token_header("admin-token"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["metrics"]["active_units"] == 12
    assert payload["metrics"]["for_verification"] == 8
    assert payload["metrics"]["pending_payments"] == 5
    assert payload["metrics"]["confirmed"] == 6
    assert payload["summary"]["bookings"] == 44
    assert payload["summary"]["cash_collected"] == 24000
    assert payload["from_date"] == "2026-02-01"
    assert payload["to_date"] == "2026-02-07"


def test_dashboard_summary_rejects_invalid_range(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    response = client.get(
        "/v2/dashboard/summary?from_date=2026-02-10&to_date=2026-02-01",
        headers=_token_header("admin-token"),
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "to_date must be on or after from_date."


def test_dashboard_perf_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    response = client.get("/v2/dashboard/perf", headers=_token_header("guest-token"))
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_dashboard_perf_snapshot_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    response = client.get("/v2/dashboard/perf", headers=_token_header("admin-token"))
    assert response.status_code == 200
    payload = response.json()
    assert "generated_at" in payload
    assert "api" in payload
    assert "db" in payload
