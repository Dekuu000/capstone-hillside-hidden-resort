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


def test_occupancy_forecast_filters_invalid_items_before_persist(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    monkeypatch.setattr("app.api.v2.routes.ai.get_latest_ai_occupancy_forecast", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.ai.get_daily_occupancy_history", lambda days: [{"day": days}])
    monkeypatch.setattr(
        "app.api.v2.routes.ai.get_occupancy_forecast",
        lambda **_: {
            "generated_at": "2026-04-22T00:00:00+00:00",
            "start_date": "2026-04-23",
            "horizon_days": 2,
            "model_version": "prophet-v1",
            "source": "hillside-ai-remote",
            "items": [
                {"date": "2026-04-23", "occupancy": 0.55},
                {"date": "bad-date", "occupancy": 0.8},
                "bad-row",
            ],
            "notes": ["ok", 2],
        },
    )

    captured: dict = {}

    def _capture_insert(**kwargs):
        captured["items"] = kwargs.get("items")
        return {"forecast_id": 123}

    monkeypatch.setattr("app.api.v2.routes.ai.insert_ai_occupancy_forecast", _capture_insert)

    response = client.post(
        "/v2/ai/occupancy/forecast",
        json={"start_date": "2026-04-23", "horizon_days": 2, "history_days": 30},
        headers={"Authorization": "Bearer admin-token"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert captured["items"] == [{"date": "2026-04-23", "occupancy": 0.55}]
    assert payload["forecast_id"] == 123
    assert payload["items"] == [{"date": "2026-04-23", "occupancy": 0.55}]
    assert payload["notes"] == ["ok", "2"]


def test_concierge_recommendation_normalizes_segment_and_notes(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    monkeypatch.setattr("app.api.v2.routes.ai.get_anonymized_concierge_behavior", lambda **_: {"segment": "family"})
    monkeypatch.setattr(
        "app.api.v2.routes.ai.get_concierge_recommendation",
        lambda **_: {
            "segment_key": "Family Stay",
            "model_version": "remote-v2",
            "source": "hillside-ai-remote",
            "suggestions": [{"code": "spa", "title": "Spa", "description": "Relax"}],
            "notes": ["priority", 3, {"ignored": True}],
        },
    )

    captured: dict = {}

    def _capture_insert(**kwargs):
        captured["segment_key"] = kwargs.get("segment_key")
        captured["notes"] = kwargs.get("notes")
        captured["suggestions"] = kwargs.get("suggestions")
        return {"ok": True}

    monkeypatch.setattr("app.api.v2.routes.ai.insert_ai_concierge_suggestion", _capture_insert)

    response = client.post(
        "/v2/ai/concierge/recommendation",
        json={"segment_key": "Day Guest", "stay_type": "overnight"},
        headers={"Authorization": "Bearer guest-token"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert captured["segment_key"] == "family_stay"
    assert captured["notes"] == ["priority", "3"]
    assert captured["suggestions"] == [{"code": "spa", "title": "Spa", "description": "Relax"}]
    assert payload["segment_key"] == "family_stay"
    assert payload["notes"] == ["priority", "3"]
