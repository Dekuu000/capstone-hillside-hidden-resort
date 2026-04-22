from datetime import date, datetime, timedelta, timezone
import hashlib
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.auth import AuthContext, require_admin, require_authenticated
from app.integrations.ai_pricing import (
    get_concierge_recommendation,
    get_ai_pricing_metrics_snapshot,
    get_occupancy_forecast,
    get_pricing_recommendation,
)
from app.integrations.supabase_client import (
    get_anonymized_concierge_behavior,
    get_daily_occupancy_history,
    get_dynamic_pricing_signals,
    get_latest_ai_occupancy_forecast,
    insert_ai_concierge_suggestion,
    insert_ai_pricing_suggestion,
    get_supabase_client,
    insert_ai_occupancy_forecast,
)
from app.schemas.common import AiPricingMetricsResponse, AiRecommendation
from app.schemas.common import (
    ConciergeRecommendationRequest,
    ConciergeRecommendationResponse,
    ConciergeSuggestion,
    OccupancyForecastItem,
    OccupancyForecastRequest,
    OccupancyForecastResponse,
    PricingApplyRequest,
    PricingApplyResponse,
    PricingRecommendationRequest,
)

router = APIRouter()


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

    context = {
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
    target_date = payload.check_in_date or payload.visit_date
    try:
        signals = get_dynamic_pricing_signals(target_date=target_date, days=45)
    except RuntimeError:
        signals = {}
    merged_signals = dict(signals)
    merged_signals.update(context["occupancy_context"])
    context["occupancy_context"] = merged_signals
    return context


def _extract_model_version_from_explanations(recommendation: AiRecommendation) -> str:
    for line in recommendation.explanations:
        text = str(line)
        marker = "model used ("
        lowered = text.lower()
        idx = lowered.find(marker)
        if idx >= 0:
            start = idx + len(marker)
            end = text.find(")", start)
            if end > start:
                return text[start:end].strip()
    if any("fallback" in str(line).lower() for line in recommendation.explanations):
        return "fallback-v1"
    return "unknown"


def _safe_uuid_or_none(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(UUID(value))
    except (ValueError, TypeError):
        return None


def _normalize_forecast_items(raw_items: list[Any]) -> list[dict[str, Any]]:
    item_rows: list[dict[str, Any]] = []
    for row in raw_items:
        if not isinstance(row, dict):
            continue
        raw_date = str(row.get("date") or "")
        try:
            date.fromisoformat(raw_date)
        except ValueError:
            continue
        item_rows.append({"date": raw_date, "occupancy": float(row.get("occupancy") or 0)})
    return item_rows


def _normalize_concierge_result(
    result: Any,
    *,
    segment_key_fallback: str,
) -> tuple[str, str | None, str, list[dict[str, Any]], list[str]]:
    result_dict = result if isinstance(result, dict) else {}
    suggestions = [item for item in (result_dict.get("suggestions") or []) if isinstance(item, dict)]
    notes = [str(item) for item in (result_dict.get("notes") or []) if isinstance(item, (str, int, float))]
    model_version = str(result_dict.get("model_version")) if result_dict.get("model_version") else None
    segment_key_raw = str(result_dict.get("segment_key")) if result_dict.get("segment_key") else segment_key_fallback
    normalized_segment_key = segment_key_raw.strip().lower().replace(" ", "_")
    source = str(result_dict.get("source") or "hillside-ai")
    return normalized_segment_key, model_version, source, suggestions, notes


def _build_response_from_saved_forecast(saved: dict[str, Any]) -> OccupancyForecastResponse:
    raw_series = saved.get("series") if isinstance(saved.get("series"), list) else []
    item_rows = _normalize_forecast_items(raw_series)
    generated_at = saved.get("generated_at") or saved.get("created_at") or datetime.now(timezone.utc).isoformat()
    raw_inputs = saved.get("inputs") if isinstance(saved.get("inputs"), dict) else {}
    return OccupancyForecastResponse(
        forecast_id=int(saved.get("forecast_id")) if saved.get("forecast_id") is not None else None,
        generated_at=str(generated_at),
        start_date=date.fromisoformat(str(saved.get("start_date"))),
        horizon_days=int(saved.get("horizon_days") or len(item_rows)),
        model_version=str(saved.get("model_version") or "unknown"),
        source=str(saved.get("source") or "hillside-ai"),
        items=[OccupancyForecastItem(**row) for row in item_rows],
        forecast_json=item_rows,
        metrics_json=raw_inputs.get("metrics_json") if isinstance(raw_inputs.get("metrics_json"), dict) else {},
        notes=["Served from cached forecast run."],
    )


def _is_prophet_model(model_version: str | None) -> bool:
    return str(model_version or "").lower().startswith("prophet")


@router.post("/pricing/recommendation", response_model=AiRecommendation)
def pricing_recommendation(
    payload: PricingRecommendationRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    reservation_id = payload.reservation_id or "preview"
    context = _build_context(payload)
    recommendation = get_pricing_recommendation(
        reservation_id=reservation_id,
        context=context,
    )
    try:
        insert_ai_pricing_suggestion(
            created_by_user_id=auth.user_id,
            reservation_id=_safe_uuid_or_none(payload.reservation_id),
            segment_key=None,
            check_in_date=payload.check_in_date,
            check_out_date=payload.check_out_date,
            visit_date=payload.visit_date,
            suggested_multiplier=recommendation.suggested_multiplier,
            demand_bucket=recommendation.demand_bucket,
            pricing_adjustment=recommendation.pricing_adjustment,
            confidence=recommendation.confidence,
            model_version=_extract_model_version_from_explanations(recommendation),
            source="hillside-ai",
            features=context,
            explanations=recommendation.explanations,
            signal_breakdown=recommendation.signal_breakdown,
            confidence_breakdown=recommendation.confidence_breakdown,
        )
    except RuntimeError:
        pass
    return recommendation


@router.post("/pricing/predict", response_model=AiRecommendation)
def predict_pricing(
    payload: PricingRecommendationRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    return pricing_recommendation(payload=payload, auth=auth)


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
    ttl_seconds = max(30, int(settings.cache_ttl_seconds))
    strict_prophet = bool(settings.ai_require_prophet_forecast)

    try:
        latest_saved = get_latest_ai_occupancy_forecast(
            start_date=start_date.isoformat(),
            horizon_days=payload.horizon_days,
            model_prefix="prophet" if strict_prophet else None,
        )
    except RuntimeError:
        latest_saved = None

    if latest_saved and latest_saved.get("generated_at"):
        try:
            generated_at = datetime.fromisoformat(str(latest_saved["generated_at"]).replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - generated_at).total_seconds() <= ttl_seconds:
                return _build_response_from_saved_forecast(latest_saved)
        except ValueError:
            pass

    try:
        history = get_daily_occupancy_history(days=payload.history_days)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    forecast = get_occupancy_forecast(
        start_date=start_date.isoformat(),
        horizon_days=payload.horizon_days,
        history=history,
    )
    if strict_prophet and not _is_prophet_model(str(forecast.get("model_version") or "")):
        if latest_saved and _is_prophet_model(str(latest_saved.get("model_version") or "")):
            return _build_response_from_saved_forecast(latest_saved)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Prophet forecast is required in this environment. "
                "Ensure hillside-ai has Prophet installed and running, then retry."
            ),
        )
    if str(forecast.get("model_version") or "").startswith("fallback") and latest_saved:
        return _build_response_from_saved_forecast(latest_saved)

    item_rows = _normalize_forecast_items(forecast.get("items") or [])

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
                "metrics_json": forecast.get("metrics_json") if isinstance(forecast.get("metrics_json"), dict) else {},
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
        forecast_json=forecast.get("forecast_json") if isinstance(forecast.get("forecast_json"), list) else item_rows,
        metrics_json=forecast.get("metrics_json") if isinstance(forecast.get("metrics_json"), dict) else {},
        notes=[str(note) for note in (forecast.get("notes") or [])],
    )


@router.post("/pricing/apply", response_model=PricingApplyResponse)
def apply_pricing_recommendation(
    payload: PricingApplyRequest,
    auth: AuthContext = Depends(require_admin),
):
    reservation_id = payload.reservation_id or "ai_pricing_center"
    applied_at = datetime.now(timezone.utc).isoformat()
    fingerprint_input = f"{reservation_id}|{payload.pricing_adjustment}|{payload.confidence}|{payload.explanations}|{payload.notes}"
    fingerprint = hashlib.sha256(fingerprint_input.encode("utf-8")).hexdigest()

    try:
        client = get_supabase_client()
        client.table("audit_logs").insert(
            {
                "performed_by_user_id": auth.user_id,
                "entity_type": "reservation",
                "entity_id": reservation_id,
                "action": "update",
                "data_hash": fingerprint,
                "metadata": {
                    "source": "ai_pricing_apply",
                    "pricing_adjustment": payload.pricing_adjustment,
                    "confidence": payload.confidence,
                    "explanations": payload.explanations,
                    "notes": payload.notes,
                },
            }
        ).execute()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return PricingApplyResponse(
        reservation_id=payload.reservation_id,
        applied_at=applied_at,
    )


@router.post("/concierge/recommendation", response_model=ConciergeRecommendationResponse)
def concierge_recommendation(
    payload: ConciergeRecommendationRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        behavior = get_anonymized_concierge_behavior(days=120)
    except RuntimeError:
        behavior = {}

    result = get_concierge_recommendation(
        segment_key=payload.segment_key,
        stay_type=payload.stay_type,
        behavior=behavior,
        allow_remote=True,
    )
    segment_key, model_version, source, suggestions, notes = _normalize_concierge_result(
        result,
        segment_key_fallback=payload.segment_key,
    )
    try:
        insert_ai_concierge_suggestion(
            created_by_user_id=auth.user_id,
            segment_key=segment_key,
            stay_type=payload.stay_type,
            model_version=model_version or "unknown",
            source=source,
            behavior=behavior,
            suggestions=suggestions,
            notes=notes,
        )
    except RuntimeError:
        pass
    return ConciergeRecommendationResponse(
        segment_key=segment_key,
        stay_type=payload.stay_type,
        model_version=model_version,
        suggestions=[ConciergeSuggestion(**item) for item in suggestions],
        notes=notes,
    )
