from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import AuthContext, require_admin, require_authenticated
from app.integrations.ai_pricing import (
    get_ai_pricing_metrics_snapshot,
    get_occupancy_forecast,
    get_pricing_recommendation,
)
from app.integrations.supabase_client import (
    get_daily_occupancy_history,
    insert_ai_occupancy_forecast,
)
from app.schemas.common import AiPricingMetricsResponse, AiRecommendation

router = APIRouter()


class PricingRecommendationRequest(BaseModel):
    reservation_id: str | None = None
    check_in_date: str | None = None
    check_out_date: str | None = None
    visit_date: str | None = None
    total_amount: float | None = None
    party_size: int | None = None
    unit_count: int | None = None
    is_tour: bool = False
    occupancy_context: dict = Field(default_factory=dict)


class OccupancyForecastRequest(BaseModel):
    start_date: date | None = None
    horizon_days: int = Field(default=7, ge=1, le=30)
    history_days: int = Field(default=30, ge=7, le=180)


class OccupancyForecastItem(BaseModel):
    date: date
    occupancy: float


class OccupancyForecastResponse(BaseModel):
    forecast_id: int | None = None
    generated_at: str
    start_date: date
    horizon_days: int
    model_version: str
    source: str
    items: list[OccupancyForecastItem]
    notes: list[str] = Field(default_factory=list)


def _is_weekend_from_payload(payload: PricingRecommendationRequest) -> bool:
    raw = payload.check_in_date or payload.visit_date
    if not raw:
        return False
    try:
        return date.fromisoformat(raw).weekday() >= 5
    except ValueError:
        return False


def _build_context(payload: PricingRecommendationRequest) -> dict:
    nights = 1
    if payload.check_in_date and payload.check_out_date:
        try:
            check_in = date.fromisoformat(payload.check_in_date)
            check_out = date.fromisoformat(payload.check_out_date)
            nights = max(1, (check_out - check_in).days)
        except ValueError:
            nights = 1

    return {
        "check_in_date": payload.check_in_date,
        "check_out_date": payload.check_out_date,
        "visit_date": payload.visit_date,
        "total_amount": payload.total_amount,
        "party_size": payload.party_size or 1,
        "unit_count": payload.unit_count or 1,
        "nights": nights,
        "is_weekend": _is_weekend_from_payload(payload),
        "is_tour": payload.is_tour,
        "occupancy_context": payload.occupancy_context or {},
    }


@router.post("/pricing/recommendation", response_model=AiRecommendation)
def pricing_recommendation(
    payload: PricingRecommendationRequest,
    _auth: AuthContext = Depends(require_authenticated),
):
    reservation_id = payload.reservation_id or "preview"
    return get_pricing_recommendation(
        reservation_id=reservation_id,
        context=_build_context(payload),
    )


@router.post("/pricing/predict", response_model=AiRecommendation)
def predict_pricing(
    payload: PricingRecommendationRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    return pricing_recommendation(payload=payload, _auth=auth)


@router.get("/pricing/metrics", response_model=AiPricingMetricsResponse)
def pricing_metrics(
    _auth: AuthContext = Depends(require_admin),
):
    return get_ai_pricing_metrics_snapshot()


@router.post("/occupancy/forecast", response_model=OccupancyForecastResponse)
def occupancy_forecast(
    payload: OccupancyForecastRequest,
    auth: AuthContext = Depends(require_admin),
):
    start_date = payload.start_date or (date.today() + timedelta(days=1))

    try:
        history = get_daily_occupancy_history(days=payload.history_days)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    forecast = get_occupancy_forecast(
        start_date=start_date.isoformat(),
        horizon_days=payload.horizon_days,
        history=history,
    )

    item_rows: list[dict[str, Any]] = []
    for row in forecast.get("items") or []:
        if not isinstance(row, dict):
            continue
        try:
            date.fromisoformat(str(row.get("date")))
        except ValueError:
            continue
        item_rows.append(
            {
                "date": str(row.get("date")),
                "occupancy": float(row.get("occupancy") or 0),
            }
        )

    try:
        inserted = insert_ai_occupancy_forecast(
            created_by_user_id=auth.user_id,
            start_date=start_date.isoformat(),
            horizon_days=payload.horizon_days,
            model_version=str(forecast.get("model_version") or "unknown"),
            source=str(forecast.get("source") or "hillside-ai"),
            inputs={
                "history_days": payload.history_days,
                "history_count": len(history),
            },
            items=item_rows,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return OccupancyForecastResponse(
        forecast_id=int(inserted.get("forecast_id")) if inserted and inserted.get("forecast_id") is not None else None,
        generated_at=str(forecast.get("generated_at") or ""),
        start_date=date.fromisoformat(str(forecast.get("start_date") or start_date.isoformat())),
        horizon_days=int(forecast.get("horizon_days") or payload.horizon_days),
        model_version=str(forecast.get("model_version") or "unknown"),
        source=str(forecast.get("source") or "hillside-ai"),
        items=[OccupancyForecastItem(**row) for row in item_rows],
        notes=[str(note) for note in (forecast.get("notes") or [])],
    )
