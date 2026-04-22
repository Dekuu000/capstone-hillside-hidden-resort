from app.api.v2.routes.ai import _normalize_concierge_result, _normalize_forecast_items


def test_normalize_forecast_items_filters_invalid_rows() -> None:
    raw_items = [
        {"date": "2026-04-22", "occupancy": 0.35},
        {"date": "invalid-date", "occupancy": 0.45},
        {"date": "2026-04-23", "occupancy": "0.6"},
        "bad-row",
    ]

    assert _normalize_forecast_items(raw_items) == [
        {"date": "2026-04-22", "occupancy": 0.35},
        {"date": "2026-04-23", "occupancy": 0.6},
    ]


def test_normalize_concierge_result_with_result_payload() -> None:
    segment_key, model_version, source, suggestions, notes = _normalize_concierge_result(
        {
            "segment_key": "Family Stay",
            "model_version": "remote-v2",
            "source": "hillside-ai-remote",
            "suggestions": [{"code": "spa", "title": "Spa", "description": "Relax"}],
            "notes": ["priority segment", 2, {"ignore": True}],
        },
        segment_key_fallback="fallback-segment",
    )

    assert segment_key == "family_stay"
    assert model_version == "remote-v2"
    assert source == "hillside-ai-remote"
    assert suggestions == [{"code": "spa", "title": "Spa", "description": "Relax"}]
    assert notes == ["priority segment", "2"]


def test_normalize_concierge_result_uses_fallback_when_result_not_dict() -> None:
    segment_key, model_version, source, suggestions, notes = _normalize_concierge_result(
        None,
        segment_key_fallback="Day Guest",
    )

    assert segment_key == "day_guest"
    assert model_version is None
    assert source == "hillside-ai"
    assert suggestions == []
    assert notes == []
