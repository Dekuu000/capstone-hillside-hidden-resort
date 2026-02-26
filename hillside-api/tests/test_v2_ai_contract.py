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


def test_pricing_recommendation_requires_auth() -> None:
    response = client.post("/v2/ai/pricing/recommendation", json={"total_amount": 1200})
    assert response.status_code == 401


def test_pricing_recommendation_returns_fallback(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    monkeypatch.setattr("app.integrations.ai_pricing.settings.ai_service_base_url", "")

    response = client.post(
        "/v2/ai/pricing/recommendation",
        json={
            "reservation_id": "res-1",
            "check_in_date": "2026-02-21",
            "check_out_date": "2026-02-23",
            "total_amount": 2400,
            "unit_count": 1,
            "party_size": 3,
        },
        headers={"Authorization": "Bearer guest-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_id"] == "res-1"
    assert isinstance(payload["pricing_adjustment"], float)
    assert isinstance(payload["confidence"], float)
    assert isinstance(payload["explanations"], list)
    assert payload["explanations"]


def test_pricing_predict_alias_works(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    monkeypatch.setattr("app.integrations.ai_pricing.settings.ai_service_base_url", "")

    response = client.post(
        "/v2/ai/pricing/predict",
        json={"reservation_id": "res-2", "total_amount": 900, "visit_date": "2026-02-22", "is_tour": True},
        headers={"Authorization": "Bearer guest-token"},
    )
    assert response.status_code == 200
    assert response.json()["reservation_id"] == "res-2"


def test_pricing_metrics_requires_admin(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    response = client.get(
        "/v2/ai/pricing/metrics",
        headers={"Authorization": "Bearer guest-token"},
    )
    assert response.status_code == 403


def test_pricing_metrics_returns_snapshot(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    response = client.get(
        "/v2/ai/pricing/metrics",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "generated_at" in payload
    assert "latency_ms" in payload
    assert payload["fallback_rate"] >= 0
    assert payload["fallback_rate"] <= 1
