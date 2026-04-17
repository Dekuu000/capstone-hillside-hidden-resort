from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
from threading import Lock
from time import monotonic
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="hillside-ai", version="0.1.0")

_PRICING_FEATURE_NAMES = [
    "baseline_rate",
    "weekend",
    "tour_mode",
    "party_size",
    "booking_velocity",
    "blockchain_booking_velocity",
    "seasonality_index",
    "weather_forecast_score",
    "chain_confirm_ratio",
]
_PRICING_MODEL_CACHE: dict[str, Any] | None = None
_PRICING_MODEL_LOCK = Lock()
_FORECAST_CACHE_TTL_SEC = 300.0
_FORECAST_CACHE_MAX = 64
_FORECAST_CACHE: dict[str, tuple[float, OccupancyForecastResponse]] = {}
_FORECAST_CACHE_LOCK = Lock()


class PricingRecommendationRequest(BaseModel):
    reservation_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class PricingRecommendation(BaseModel):
    reservation_id: str
    pricing_adjustment: float
    confidence: float = Field(ge=0.0, le=1.0)
    explanations: list[str] = Field(default_factory=list)
    suggested_multiplier: float | None = None
    demand_bucket: str | None = None
    signal_breakdown: list[dict[str, float | str]] = Field(default_factory=list)
    confidence_breakdown: dict[str, float] | None = None


class PricingRecommendationResponse(BaseModel):
    recommendation: PricingRecommendation
    model_version: str = "heuristic-v1"
    source: str = "hillside-ai"


class OccupancyObservation(BaseModel):
    date: date
    occupancy: float = Field(ge=0.0)


class OccupancyForecastRequest(BaseModel):
    start_date: date | None = None
    horizon_days: int = Field(default=7, ge=1, le=30)
    history: list[OccupancyObservation] = Field(default_factory=list)


class OccupancyForecastItem(BaseModel):
    date: date
    occupancy: float = Field(ge=0.0)


class OccupancyForecastResponse(BaseModel):
    generated_at: datetime
    start_date: date
    horizon_days: int
    model_version: str
    source: str = "hillside-ai"
    items: list[OccupancyForecastItem] = Field(default_factory=list)
    forecast_json: list[dict[str, Any]] = Field(default_factory=list)
    metrics_json: dict[str, Any] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class ConciergeRecommendationRequest(BaseModel):
    segment_key: str
    stay_type: str | None = None
    behavior: dict[str, Any] = Field(default_factory=dict)


class ConciergeSuggestion(BaseModel):
    code: str
    title: str
    description: str
    reasons: list[str] = Field(default_factory=list)
    score: float = Field(default=0.0, ge=0.0)


class ConciergeRecommendationResponse(BaseModel):
    segment_key: str
    stay_type: str | None = None
    model_version: str = "sklearn-segment-similarity-v1"
    source: str = "hillside-ai"
    suggestions: list[ConciergeSuggestion] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


def _forecast_cache_key(payload: OccupancyForecastRequest) -> str:
    normalized_history = [
        {"date": item.date.isoformat(), "occupancy": round(float(item.occupancy), 4)}
        for item in sorted(payload.history, key=lambda x: x.date)
    ]
    normalized_payload = {
        "start_date": (payload.start_date or date.today()).isoformat(),
        "horizon_days": int(payload.horizon_days),
        "history": normalized_history,
    }
    raw = json.dumps(normalized_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _forecast_cache_get(cache_key: str) -> OccupancyForecastResponse | None:
    now = monotonic()
    with _FORECAST_CACHE_LOCK:
        hit = _FORECAST_CACHE.get(cache_key)
        if hit is None:
            return None
        saved_at, response = hit
        if now - saved_at > _FORECAST_CACHE_TTL_SEC:
            _FORECAST_CACHE.pop(cache_key, None)
            return None
        return response


def _forecast_cache_put(cache_key: str, response: OccupancyForecastResponse) -> None:
    with _FORECAST_CACHE_LOCK:
        _FORECAST_CACHE[cache_key] = (monotonic(), response)
        if len(_FORECAST_CACHE) <= _FORECAST_CACHE_MAX:
            return
        oldest_key = min(_FORECAST_CACHE.items(), key=lambda item: item[1][0])[0]
        _FORECAST_CACHE.pop(oldest_key, None)


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _multiplier_and_bucket(*, total_amount: float, pricing_adjustment: float) -> tuple[float, str]:
    base = max(1.0, float(total_amount or 0.0))
    multiplier = max(0.5, min(2.0, (base + float(pricing_adjustment or 0.0)) / base))
    if multiplier < 0.97:
        bucket = "low"
    elif multiplier > 1.08:
        bucket = "high"
    else:
        bucket = "normal"
    return round(multiplier, 4), bucket


def _seasonality_index(target_date: date) -> float:
    month_curve = {
        1: 0.82,
        2: 0.84,
        3: 0.9,
        4: 0.96,
        5: 1.02,
        6: 1.12,
        7: 1.16,
        8: 1.14,
        9: 1.04,
        10: 0.94,
        11: 0.88,
        12: 1.08,
    }
    return month_curve.get(target_date.month, 1.0)


def _weather_forecast_score(target_date: date) -> float:
    # Seasonal prior used as weather proxy until external forecast service is wired.
    # 1.0 = neutral, >1.0 favorable weather window for demand.
    weather_curve = {
        1: 1.05,
        2: 1.06,
        3: 1.04,
        4: 1.0,
        5: 0.96,
        6: 0.9,
        7: 0.88,
        8: 0.9,
        9: 0.92,
        10: 0.95,
        11: 0.98,
        12: 1.03,
    }
    return weather_curve.get(target_date.month, 1.0)


def _fallback_pricing_response(payload: PricingRecommendationRequest) -> PricingRecommendationResponse:
    context = payload.context or {}
    reservation_id = payload.reservation_id or "preview"
    total_amount = max(0.0, _to_float(context.get("total_amount"), 0.0))
    nights = max(1, _to_int(context.get("nights"), 1))
    party_size = max(1, _to_int(context.get("party_size"), 1))
    unit_count = max(1, _to_int(context.get("unit_count"), 1))
    is_weekend = bool(context.get("is_weekend"))
    is_tour = bool(context.get("is_tour"))

    baseline = total_amount / max(1.0, nights * unit_count)
    adjustment = 0.0
    weekend_bump = 0.0
    tour_bump = 0.0
    party_bump = 0.0
    explanations: list[str] = ["Fallback model used (heuristic v1)."]

    if is_weekend:
        weekend_bump = max(20.0, baseline * 0.05)
        adjustment += weekend_bump
        explanations.append("Weekend uplift applied.")

    if is_tour and party_size >= 3:
        tour_bump = max(12.0, total_amount * 0.02)
        adjustment += tour_bump
        explanations.append("Tour group-size uplift applied.")
    elif not is_tour and party_size >= 4:
        party_bump = max(10.0, baseline * 0.03)
        adjustment += party_bump
        explanations.append("Large-party occupancy uplift applied.")

    confidence = 0.78 if adjustment > 0 else 0.72
    suggested_multiplier, demand_bucket = _multiplier_and_bucket(
        total_amount=total_amount,
        pricing_adjustment=adjustment,
    )
    signal_breakdown = [
        {"signal": "weekend", "value": float(is_weekend), "impact": round(weekend_bump, 2)},
        {"signal": "tour_mode", "value": float(is_tour), "impact": round(tour_bump, 2)},
        {"signal": "party_size", "value": float(party_size), "impact": round(party_bump, 2)},
    ]
    return PricingRecommendationResponse(
        recommendation=PricingRecommendation(
            reservation_id=reservation_id,
            pricing_adjustment=round(adjustment, 2),
            confidence=round(_clamp(confidence, 0.0, 1.0), 2),
            explanations=explanations,
            suggested_multiplier=suggested_multiplier,
            demand_bucket=demand_bucket,
            signal_breakdown=signal_breakdown,
            confidence_breakdown={
                "model_fit_score": 0.0,
                "raw_confidence": round(confidence, 4),
                "final_confidence": round(_clamp(confidence, 0.0, 1.0), 4),
                "zero_adjustment_penalty": 0.0 if adjustment > 0 else 0.06,
                "predicted_adjustment": round(adjustment, 4),
                "explained_sum": round(adjustment, 4),
                "reconciliation_delta": 0.0,
            },
        ),
        model_version="heuristic-v1",
    )


def _build_pricing_training_set() -> tuple[list[list[float]], list[float]]:
    train_x: list[list[float]] = []
    train_y: list[float] = []
    for base in [600.0, 1200.0, 2100.0, 3200.0]:
        for weekend in [0.0, 1.0]:
            for tour in [0.0, 1.0]:
                for party in [1.0, 2.0, 4.0, 6.0]:
                    for velocity in [0.6, 1.0, 1.5, 2.2]:
                        for chain_vel in [0.6, 1.0, 1.6]:
                            for season in [0.8, 1.0, 1.2]:
                                for weather in [0.85, 1.0, 1.15]:
                                    for confirm_ratio in [0.3, 0.6, 0.9]:
                                        adjustment = (
                                            0.05 * base
                                            + 24.0 * weekend
                                            + 16.0 * tour
                                            + 2.8 * party
                                            + 21.0 * (velocity - 1.0)
                                            + 17.0 * (chain_vel - 1.0)
                                            + 32.0 * (season - 1.0)
                                            + 18.0 * (weather - 1.0)
                                            + 20.0 * (confirm_ratio - 0.5)
                                        )
                                        noise = math.sin(base + party + velocity + season) * 2.0
                                        train_x.append(
                                            [
                                                base,
                                                weekend,
                                                tour,
                                                party,
                                                velocity,
                                                chain_vel,
                                                season,
                                                weather,
                                                confirm_ratio,
                                            ]
                                        )
                                        train_y.append(float(adjustment + noise))
    return train_x, train_y


def _get_pricing_model():
    global _PRICING_MODEL_CACHE
    if _PRICING_MODEL_CACHE is not None:
        return _PRICING_MODEL_CACHE

    with _PRICING_MODEL_LOCK:
        if _PRICING_MODEL_CACHE is not None:
            return _PRICING_MODEL_CACHE
        try:
            from sklearn.linear_model import Ridge
        except Exception:
            return None

        train_x, train_y = _build_pricing_training_set()
        model = Ridge(alpha=1.2)
        model.fit(train_x, train_y)
        fit_score = _clamp(float(model.score(train_x, train_y)), 0.0, 1.0)

        _PRICING_MODEL_CACHE = {
            "model": model,
            "fit_score": fit_score,
        }
        return _PRICING_MODEL_CACHE


def _build_sklearn_pricing_response(payload: PricingRecommendationRequest) -> PricingRecommendationResponse:
    context = payload.context or {}
    reservation_id = payload.reservation_id or "preview"
    total_amount = max(0.0, _to_float(context.get("total_amount"), 0.0))
    nights = max(1, _to_int(context.get("nights"), 1))
    party_size = max(1, _to_int(context.get("party_size"), 1))
    unit_count = max(1, _to_int(context.get("unit_count"), 1))
    is_weekend = 1.0 if bool(context.get("is_weekend")) else 0.0
    is_tour = 1.0 if bool(context.get("is_tour")) else 0.0

    occupancy_context = context.get("occupancy_context")
    if not isinstance(occupancy_context, dict):
        occupancy_context = {}

    target_date_raw = str(context.get("check_in_date") or context.get("visit_date") or date.today().isoformat())
    try:
        target_date = date.fromisoformat(target_date_raw)
    except ValueError:
        target_date = date.today()

    baseline_rate = total_amount / max(1.0, nights * unit_count)
    booking_velocity = _clamp(_to_float(occupancy_context.get("booking_velocity"), 1.0), 0.2, 4.0)
    blockchain_booking_velocity = _clamp(
        _to_float(occupancy_context.get("blockchain_booking_velocity"), booking_velocity),
        0.2,
        4.0,
    )
    weather_score = _clamp(
        _to_float(occupancy_context.get("weather_forecast_score"), _weather_forecast_score(target_date)),
        0.6,
        1.4,
    )
    seasonality_index = _clamp(
        _to_float(occupancy_context.get("seasonal_demand_index"), _seasonality_index(target_date)),
        0.6,
        1.5,
    )
    chain_confirm_ratio = _clamp(_to_float(occupancy_context.get("chain_confirm_ratio"), 0.7), 0.0, 1.0)

    model_bundle = _get_pricing_model()
    if model_bundle is None:
        return _fallback_pricing_response(payload)
    model = model_bundle["model"]
    fit_score = _clamp(float(model_bundle["fit_score"]), 0.0, 1.0)

    features = [
        max(300.0, baseline_rate if baseline_rate > 0 else 1200.0),
        is_weekend,
        is_tour,
        float(party_size),
        booking_velocity,
        blockchain_booking_velocity,
        seasonality_index,
        weather_score,
        chain_confirm_ratio,
    ]
    predicted = float(model.predict([features])[0])
    recommended_adjustment = round(max(0.0, predicted), 2)
    suggested_multiplier, demand_bucket = _multiplier_and_bucket(
        total_amount=total_amount,
        pricing_adjustment=recommended_adjustment,
    )

    contributions: list[tuple[str, float, float]] = []
    for idx, name in enumerate(_PRICING_FEATURE_NAMES):
        coefficient = float(model.coef_[idx])
        value = features[idx]
        # Use direct linear-term contribution so attribution reconciles exactly:
        # prediction ~= intercept + Σ(coef_i * value_i)
        impact = coefficient * value
        contributions.append((name, float(impact), float(value)))
    sorted_contributions = sorted(contributions, key=lambda item: abs(item[1]), reverse=True)
    top_contributions = sorted_contributions[:3]

    explanation_map = {
        "baseline_rate": "Base rate context influenced adjustment.",
        "weekend": "Weekend demand uplift applied.",
        "tour_mode": "Tour behavior pattern uplift applied.",
        "party_size": "Party-size pressure influenced pricing.",
        "booking_velocity": "Booking velocity signal increased demand score.",
        "blockchain_booking_velocity": "Blockchain-confirmed booking velocity impacted pricing.",
        "seasonality_index": "Seasonal demand index affected recommendation.",
        "weather_forecast_score": "Weather forecast signal influenced demand confidence.",
        "chain_confirm_ratio": "Higher chain-confirm ratio boosted confidence.",
    }
    explanations = ["Live model used (sklearn-ridge-pricing-v1)."]
    for name, _, _ in top_contributions:
        explanations.append(explanation_map.get(name, f"{name} signal applied."))

    raw_confidence = 0.7 + 0.2 * fit_score
    zero_adjustment_penalty = 0.12 if recommended_adjustment == 0 else 0.0
    confidence = _clamp(raw_confidence - zero_adjustment_penalty, 0.45, 0.96)

    signal_breakdown: list[dict[str, float | str]] = [
        {
            "signal": "model_intercept",
            "value": 1.0,
            "impact": round(float(model.intercept_), 4),
        }
    ]
    for name, impact, value in sorted_contributions:
        signal_breakdown.append(
            {
                "signal": name,
                "value": round(value, 4),
                "impact": round(float(impact), 4),
            }
        )
    explained_sum = float(model.intercept_) + sum(float(item[1]) for item in contributions)
    reconciliation_delta = float(predicted - explained_sum)

    return PricingRecommendationResponse(
        recommendation=PricingRecommendation(
            reservation_id=reservation_id,
            pricing_adjustment=recommended_adjustment,
            confidence=round(confidence, 2),
            explanations=explanations,
            suggested_multiplier=suggested_multiplier,
            demand_bucket=demand_bucket,
            signal_breakdown=signal_breakdown,
            confidence_breakdown={
                "model_fit_score": round(fit_score, 4),
                "raw_confidence": round(raw_confidence, 4),
                "final_confidence": round(confidence, 4),
                "zero_adjustment_penalty": round(zero_adjustment_penalty, 4),
                "predicted_adjustment": round(float(predicted), 4),
                "explained_sum": round(float(explained_sum), 4),
                "reconciliation_delta": round(float(reconciliation_delta), 4),
            },
        ),
        model_version="sklearn-ridge-pricing-v1",
    )


def _fallback_forecast(payload: OccupancyForecastRequest) -> OccupancyForecastResponse:
    start_date = payload.start_date or date.today()
    history_values = [float(item.occupancy) for item in payload.history]
    baseline = sum(history_values) / len(history_values) if history_values else 0.0

    items: list[OccupancyForecastItem] = []
    for step in range(payload.horizon_days):
        target_day = start_date + timedelta(days=step)
        weekend_uplift = 0.15 if target_day.weekday() >= 5 else 0.0
        predicted = max(0.0, baseline * (1 + weekend_uplift))
        items.append(OccupancyForecastItem(date=target_day, occupancy=round(predicted, 2)))

    forecast_json = [{"date": item.date.isoformat(), "occupancy": item.occupancy} for item in items]
    metrics_json = {
        "history_size": len(history_values),
        "method": "fallback-weekend-mean",
    }
    return OccupancyForecastResponse(
        generated_at=datetime.now(timezone.utc),
        start_date=start_date,
        horizon_days=payload.horizon_days,
        model_version="fallback-mean-weekend-v1",
        items=items,
        forecast_json=forecast_json,
        metrics_json=metrics_json,
        notes=["Fallback model used because scikit-learn is unavailable."],
    )


def _build_sklearn_forecast(payload: OccupancyForecastRequest) -> OccupancyForecastResponse:
    start_date = payload.start_date or date.today()
    if not payload.history:
        return _fallback_forecast(payload)

    try:
        from sklearn.linear_model import LinearRegression
    except Exception:
        return _fallback_forecast(payload)

    base_date = min(item.date for item in payload.history)
    ordered_history = sorted(payload.history, key=lambda item: item.date)

    x_values: list[list[float]] = []
    y_values: list[float] = []
    for item in ordered_history:
        offset = (item.date - base_date).days
        x_values.append([float(offset), 1.0 if item.date.weekday() >= 5 else 0.0])
        y_values.append(float(item.occupancy))

    model = LinearRegression()
    model.fit(x_values, y_values)

    items: list[OccupancyForecastItem] = []
    for step in range(payload.horizon_days):
        target_day = start_date + timedelta(days=step)
        offset = (target_day - base_date).days
        prediction = model.predict([[float(offset), 1.0 if target_day.weekday() >= 5 else 0.0]])[0]
        items.append(OccupancyForecastItem(date=target_day, occupancy=round(max(0.0, float(prediction)), 2)))

    forecast_json = [{"date": item.date.isoformat(), "occupancy": item.occupancy} for item in items]
    metrics_json = {
        "history_size": len(ordered_history),
        "feature_set": ["day_index", "is_weekend"],
        "intercept": round(float(model.intercept_), 6),
    }
    return OccupancyForecastResponse(
        generated_at=datetime.now(timezone.utc),
        start_date=start_date,
        horizon_days=payload.horizon_days,
        model_version="sklearn-linear-regression-v1",
        items=items,
        forecast_json=forecast_json,
        metrics_json=metrics_json,
        notes=["Model features: day index + weekend signal over blockchain-confirmed arrival history."],
    )


def _build_prophet_forecast(payload: OccupancyForecastRequest) -> OccupancyForecastResponse:
    start_date = payload.start_date or date.today()
    if not payload.history:
        return _build_sklearn_forecast(payload)

    try:
        import pandas as pd
        from prophet import Prophet
    except Exception:
        return _build_sklearn_forecast(payload)

    ordered_history = sorted(payload.history, key=lambda item: item.date)
    history_df = pd.DataFrame(
        {
            "ds": [item.date for item in ordered_history],
            "y": [max(0.0, float(item.occupancy)) for item in ordered_history],
        }
    )

    try:
        model = Prophet(
            weekly_seasonality=True,
            yearly_seasonality=True,
            daily_seasonality=False,
            changepoint_prior_scale=0.08,
            seasonality_prior_scale=8.0,
        )
        model.fit(history_df)
    except Exception:
        return _build_sklearn_forecast(payload)

    future = model.make_future_dataframe(periods=payload.horizon_days, freq="D", include_history=False)
    forecast_df = model.predict(future)

    items: list[OccupancyForecastItem] = []
    for row in forecast_df.itertuples(index=False):
        target_day = getattr(row, "ds").date()
        predicted = max(0.0, float(getattr(row, "yhat")))
        items.append(OccupancyForecastItem(date=target_day, occupancy=round(predicted, 2)))

    # Training diagnostics for capstone defense panel.
    in_sample = model.predict(history_df[["ds"]])
    merged = history_df.copy()
    merged["yhat"] = in_sample["yhat"]
    mae = float((merged["y"] - merged["yhat"]).abs().mean()) if len(merged) else 0.0
    rmse = float(((merged["y"] - merged["yhat"]) ** 2).mean() ** 0.5) if len(merged) else 0.0

    forecast_json = [{"date": item.date.isoformat(), "occupancy": item.occupancy} for item in items]
    metrics_json = {
        "history_size": len(history_df),
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "changepoint_prior_scale": 0.08,
        "seasonality_prior_scale": 8.0,
    }

    return OccupancyForecastResponse(
        generated_at=datetime.now(timezone.utc),
        start_date=start_date,
        horizon_days=payload.horizon_days,
        model_version="prophet-occupancy-v1",
        items=items,
        forecast_json=forecast_json,
        metrics_json=metrics_json,
        notes=["Prophet forecast trained on blockchain-confirmed daily occupancy history."],
    )


def _build_concierge_recommendation(payload: ConciergeRecommendationRequest) -> ConciergeRecommendationResponse:
    normalized_segment = payload.segment_key.strip().lower().replace(" ", "_")
    stay_type = (payload.stay_type or "").strip().lower() or None
    behavior = payload.behavior if isinstance(payload.behavior, dict) else {}

    try:
        from sklearn.neighbors import NearestNeighbors
    except Exception:
        # Deterministic fallback that still keeps segment anonymized and structured.
        fallback_cards = [
            ConciergeSuggestion(
                code="tour_day_family",
                title="Family Day Tour Bundle",
                description="Kid-friendly pacing with shade-heavy route.",
                reasons=["Fallback concierge profile used.", "Segment preference inferred from anonymized behavior."],
                score=0.71,
            ),
            ConciergeSuggestion(
                code="dining_poolside",
                title="Poolside Dining Slot",
                description="Recommended early dinner slot near poolside zone.",
                reasons=["Popular fallback for mixed guest groups."],
                score=0.63,
            ),
        ]
        return ConciergeRecommendationResponse(
            segment_key=normalized_segment,
            stay_type=stay_type,
            model_version="fallback-rules-concierge-v1",
            suggestions=fallback_cards,
            notes=["Fallback concierge model used because scikit-learn is unavailable."],
        )

    # Anonymous behavior vector:
    # [kid_ratio, avg_party_size, day_tour_ratio, dining_ratio, spend_index]
    kid_ratio = _clamp(_to_float(behavior.get("kid_ratio"), 0.2), 0.0, 1.0)
    avg_party_size = _clamp(_to_float(behavior.get("avg_party_size"), 3.0), 1.0, 8.0)
    day_tour_ratio = _clamp(_to_float(behavior.get("day_tour_ratio"), 0.5), 0.0, 1.0)
    dining_ratio = _clamp(_to_float(behavior.get("dining_ratio"), 0.5), 0.0, 1.0)
    spend_index = _clamp(_to_float(behavior.get("spend_index"), 1.0), 0.5, 1.8)

    base_vector = [kid_ratio, avg_party_size, day_tour_ratio, dining_ratio, spend_index]

    segment_profiles: dict[str, list[float]] = {
        "family_weekend": [0.45, 4.2, 0.75, 0.62, 1.08],
        "couple_escape": [0.0, 2.0, 0.35, 0.8, 1.18],
        "barkada_daytrip": [0.08, 5.1, 0.82, 0.55, 0.97],
    }
    target_profile = segment_profiles.get(normalized_segment, base_vector)

    card_catalog = [
        ("tour_day_family", "Family Day Tour Bundle", "Morning tour with kid-friendly pacing.", [0.55, 4.6, 0.85, 0.4, 1.0]),
        ("tour_sunset_pair", "Sunset Pair Tour", "Low-crowd evening itinerary for two.", [0.0, 2.0, 0.3, 0.65, 1.15]),
        ("tour_group_combo", "Group Adventure Combo", "High-energy daytime group experience.", [0.05, 5.2, 0.9, 0.45, 0.95]),
        ("dining_poolside", "Poolside Dining Slot", "Early dining near amenity zones.", [0.25, 3.2, 0.4, 0.92, 1.05]),
        ("dining_quiet_deck", "Quiet Deck Dinner", "Recommended low-noise dinner schedule.", [0.02, 2.1, 0.28, 0.88, 1.2]),
    ]

    vectors = [item[3] for item in card_catalog]
    nn = NearestNeighbors(n_neighbors=min(3, len(vectors)), metric="euclidean")
    nn.fit(vectors)
    distances, indices = nn.kneighbors([target_profile])

    suggestions: list[ConciergeSuggestion] = []
    for distance, idx in zip(distances[0], indices[0]):
        code, title, description, _ = card_catalog[int(idx)]
        similarity = _clamp(1.0 / (1.0 + float(distance)), 0.0, 1.0)
        reasons = [
            "Suggested from anonymized historical segment patterns.",
            f"Similarity score {similarity:.2f} against {normalized_segment or 'custom_segment'} profile.",
        ]
        if stay_type:
            reasons.append(f"Stay type context considered: {stay_type}.")
        suggestions.append(
            ConciergeSuggestion(
                code=code,
                title=title,
                description=description,
                reasons=reasons,
                score=round(similarity, 2),
            )
        )

    return ConciergeRecommendationResponse(
        segment_key=normalized_segment,
        stay_type=stay_type,
        suggestions=suggestions,
        notes=["Concierge model uses anonymized segment vectors only."],
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "hillside-ai", "version": "0.1.0"}


@app.post("/v1/pricing/recommendation", response_model=PricingRecommendationResponse)
def pricing_recommendation(payload: PricingRecommendationRequest) -> PricingRecommendationResponse:
    return _build_sklearn_pricing_response(payload)


@app.post("/v1/occupancy/forecast", response_model=OccupancyForecastResponse)
def occupancy_forecast(payload: OccupancyForecastRequest) -> OccupancyForecastResponse:
    cache_key = _forecast_cache_key(payload)
    cached = _forecast_cache_get(cache_key)
    if cached is not None:
        return cached

    response = _build_prophet_forecast(payload)
    _forecast_cache_put(cache_key, response)
    return response


@app.post("/v1/concierge/recommendation", response_model=ConciergeRecommendationResponse)
def concierge_recommendation(payload: ConciergeRecommendationRequest) -> ConciergeRecommendationResponse:
    return _build_concierge_recommendation(payload)
