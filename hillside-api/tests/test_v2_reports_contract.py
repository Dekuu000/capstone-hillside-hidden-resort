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


def test_report_transactions_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)

    response = client.get(
        "/v2/reports/transactions?from_date=2026-02-01&to_date=2026-02-02",
        headers=_token_header("guest-token"),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_report_transactions_contract(monkeypatch) -> None:
    captured: dict = {}

    def fake_list_report_transactions(**kwargs):
        captured.update(kwargs)
        return (
            [
                {
                    "payment_id": "payment-1",
                    "reservation_code": "HR-001",
                    "amount": 500,
                    "status": "verified",
                    "method": "gcash",
                    "payment_type": "deposit",
                    "created_at": "2026-02-20T10:00:00Z",
                    "verified_at": "2026-02-20T11:00:00Z",
                }
            ],
            1,
        )

    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reports.list_report_transactions_rpc",
        fake_list_report_transactions,
    )

    response = client.get(
        "/v2/reports/transactions?from_date=2026-02-01&to_date=2026-02-20&status=verified&method=gcash&payment_type=deposit&limit=20&offset=0",
        headers=_token_header("admin-token"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["limit"] == 20
    assert payload["offset"] == 0
    assert payload["has_more"] is False
    assert payload["items"][0]["payment_id"] == "payment-1"
    assert captured["status_filter"] == "verified"
    assert captured["method"] == "gcash"
    assert captured["payment_type"] == "deposit"
    assert captured["limit"] == 20
    assert captured["offset"] == 0
