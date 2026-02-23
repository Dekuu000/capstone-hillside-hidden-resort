from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="hillside-ai", version="0.1.0")


class PricingRecommendationRequest(BaseModel):
    reservation_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class PricingRecommendation(BaseModel):
    reservation_id: str
    pricing_adjustment: float
    confidence: float = Field(ge=0.0, le=1.0)
    explanations: list[str] = Field(default_factory=list)


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
    notes: list[str] = Field(default_factory=list)


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


def build_recommendation(payload: PricingRecommendationRequest) -> PricingRecommendation:
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
    explanations: list[str] = ["Live model used (heuristic v1)."]

    if is_weekend:
        bump = max(20.0, baseline * 0.05)
        adjustment += bump
        explanations.append("Weekend uplift applied.")

    if is_tour and party_size >= 3:
        bump = max(12.0, total_amount * 0.02)
        adjustment += bump
        explanations.append("Tour group-size uplift applied.")
    elif not is_tour and party_size >= 4:
        bump = max(10.0, baseline * 0.03)
        adjustment += bump
        explanations.append("Large-party occupancy uplift applied.")

    confidence = 0.78 if adjustment > 0 else 0.72
    return PricingRecommendation(
        reservation_id=reservation_id,
        pricing_adjustment=round(adjustment, 2),
        confidence=round(_clamp(confidence, 0.0, 1.0), 2),
        explanations=explanations,
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

    return OccupancyForecastResponse(
        generated_at=datetime.now(timezone.utc),
        start_date=start_date,
        horizon_days=payload.horizon_days,
        model_version="fallback-mean-weekend-v1",
        items=items,
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

    return OccupancyForecastResponse(
        generated_at=datetime.now(timezone.utc),
        start_date=start_date,
        horizon_days=payload.horizon_days,
        model_version="sklearn-linear-regression-v1",
        items=items,
        notes=["Model features: day index + weekend signal."],
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "hillside-ai", "version": "0.1.0"}


@app.post("/v1/pricing/recommendation", response_model=PricingRecommendationResponse)
def pricing_recommendation(payload: PricingRecommendationRequest) -> PricingRecommendationResponse:
    recommendation = build_recommendation(payload)
    return PricingRecommendationResponse(recommendation=recommendation)


@app.post("/v1/occupancy/forecast", response_model=OccupancyForecastResponse)
def occupancy_forecast(payload: OccupancyForecastRequest) -> OccupancyForecastResponse:
    return _build_sklearn_forecast(payload)
