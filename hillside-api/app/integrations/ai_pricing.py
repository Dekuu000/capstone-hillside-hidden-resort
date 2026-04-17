import json
import logging
from collections import deque
from datetime import date, timedelta
from datetime import datetime, timezone
from math import ceil
from threading import Lock
from time import perf_counter
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings
from app.schemas.common import AiRecommendation

logger = logging.getLogger(__name__)


def _percentile(values: list[float], pct: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, ceil((pct / 100) * len(ordered)) - 1))
    return ordered[index]


def _summarize_latency(values: list[float]) -> dict[str, float | int]:
    if not values:
        return {"count": 0, "avg_ms": 0.0, "p50_ms": 0.0, "p95_ms": 0.0, "last_ms": 0.0}
    return {
        "count": len(values),
        "avg_ms": round(sum(values) / len(values), 2),
        "p50_ms": round(_percentile(values, 50), 2),
        "p95_ms": round(_percentile(values, 95), 2),
        "last_ms": round(values[-1], 2),
    }


class _AiPricingMetrics:
    def __init__(self, *, max_samples: int = 500) -> None:
        self._lock = Lock()
        self._latencies = deque(maxlen=max_samples)
        self._total_requests = 0
        self._remote_success = 0
        self._fallback_count = 0
        self._last_fallback_reason: str | None = None
        self._last_fallback_at: str | None = None

    def record(self, *, duration_ms: float, used_fallback: bool, fallback_reason: str | None = None) -> None:
        with self._lock:
            self._latencies.append(float(duration_ms))
            self._total_requests += 1
            if used_fallback:
                self._fallback_count += 1
                self._last_fallback_reason = fallback_reason
                self._last_fallback_at = datetime.now(timezone.utc).isoformat()
            else:
                self._remote_success += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            latencies = list(self._latencies)
            total_requests = self._total_requests
            remote_success = self._remote_success
            fallback_count = self._fallback_count
            last_fallback_reason = self._last_fallback_reason
            last_fallback_at = self._last_fallback_at

        fallback_rate = round((fallback_count / total_requests), 4) if total_requests > 0 else 0.0
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_requests": total_requests,
            "remote_success": remote_success,
            "fallback_count": fallback_count,
            "fallback_rate": fallback_rate,
            "last_fallback_reason": last_fallback_reason,
            "last_fallback_at": last_fallback_at,
            "latency_ms": _summarize_latency(latencies),
        }


ai_pricing_metrics = _AiPricingMetrics()
ai_forecast_metrics = _AiPricingMetrics()
ai_concierge_metrics = _AiPricingMetrics()


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


def _fallback_recommendation(*, reservation_id: str, context: dict[str, Any], reason: str) -> AiRecommendation:
    total_amount = _to_float(context.get("total_amount"), 0.0)
    nights = max(1, _to_int(context.get("nights"), 1))
    party_size = max(1, _to_int(context.get("party_size"), 1))
    unit_count = max(1, _to_int(context.get("unit_count"), 1))
    is_weekend = bool(context.get("is_weekend"))
    is_tour = bool(context.get("is_tour"))

    baseline = total_amount / max(1.0, nights * unit_count)
    adjustment = 0.0
    explanations = [
        "Fallback model used (non-blocking).",
        reason,
    ]

    weekend_impact = 0.0
    party_impact = 0.0

    if is_weekend:
        weekend_impact = round(max(20.0, baseline * 0.04), 2)
        adjustment += weekend_impact
        explanations.append("Weekend demand uplift applied in fallback policy.")

    if party_size >= 4 and not is_tour:
        party_impact = round(max(10.0, baseline * 0.02), 2)
        adjustment += party_impact
        explanations.append("Large-party occupancy signal applied in fallback policy.")

    confidence = 0.4 if adjustment else 0.35
    total_base = max(1.0, total_amount)
    suggested_multiplier = max(0.5, min(2.0, (total_base + adjustment) / total_base))
    demand_bucket = "high" if suggested_multiplier > 1.08 else ("low" if suggested_multiplier < 0.97 else "normal")
    return AiRecommendation(
        reservation_id=reservation_id,
        pricing_adjustment=round(adjustment, 2),
        confidence=confidence,
        explanations=explanations,
        suggested_multiplier=round(suggested_multiplier, 4),
        demand_bucket=demand_bucket,
        signal_breakdown=[
            {"signal": "weekend", "value": float(is_weekend), "impact": float(weekend_impact)},
            {"signal": "party_size", "value": float(party_size), "impact": float(party_impact)},
        ],
        confidence_breakdown={
            "model_fit_score": 0.0,
            "raw_confidence": confidence,
            "final_confidence": confidence,
            "zero_adjustment_penalty": 0.0 if adjustment else 0.05,
            "predicted_adjustment": round(adjustment, 4),
            "explained_sum": round(adjustment, 4),
            "reconciliation_delta": 0.0,
        },
    )


def _month_weather_score(target_date: date) -> float:
    # Seasonal weather prior used when no external forecast provider is wired.
    curve = {
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
    return float(curve.get(target_date.month, 1.0))


def _month_seasonality_index(target_date: date) -> float:
    curve = {
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
    return float(curve.get(target_date.month, 1.0))


def enrich_pricing_context(context: dict[str, Any]) -> dict[str, Any]:
    merged = dict(context or {})
    occupancy_context = merged.get("occupancy_context")
    if not isinstance(occupancy_context, dict):
        occupancy_context = {}
    merged_occupancy = dict(occupancy_context)

    check_date_raw = str(merged.get("check_in_date") or merged.get("visit_date") or date.today().isoformat())
    try:
        target_date = date.fromisoformat(check_date_raw)
    except ValueError:
        target_date = date.today()

    booking_velocity = max(0.2, _to_float(merged_occupancy.get("booking_velocity"), 1.0))
    blockchain_booking_velocity = max(
        0.2,
        _to_float(merged_occupancy.get("blockchain_booking_velocity"), booking_velocity),
    )
    chain_confirm_ratio = max(0.0, min(1.0, _to_float(merged_occupancy.get("chain_confirm_ratio"), 0.7)))

    merged_occupancy.setdefault("booking_velocity", round(booking_velocity, 3))
    merged_occupancy.setdefault("blockchain_booking_velocity", round(blockchain_booking_velocity, 3))
    merged_occupancy.setdefault("chain_confirm_ratio", round(chain_confirm_ratio, 3))
    merged_occupancy.setdefault("weather_forecast_score", round(_month_weather_score(target_date), 3))
    merged_occupancy.setdefault("seasonal_demand_index", round(_month_seasonality_index(target_date), 3))

    merged["occupancy_context"] = merged_occupancy
    return merged


def _extract_recommendation(*, reservation_id: str, payload: dict[str, Any]) -> AiRecommendation | None:
    candidate = payload.get("recommendation")
    if isinstance(candidate, dict):
        payload = candidate

    if not isinstance(payload, dict):
        return None

    explanations_raw = payload.get("explanations")
    if not isinstance(explanations_raw, list):
        explanations_raw = []
    explanations = [str(item) for item in explanations_raw if isinstance(item, (str, int, float))]

    signal_breakdown_raw = payload.get("signal_breakdown")
    signal_breakdown: list[dict[str, float | str]] = []
    if isinstance(signal_breakdown_raw, list):
        for entry in signal_breakdown_raw:
            if not isinstance(entry, dict):
                continue
            signal = str(entry.get("signal") or "").strip()
            if not signal:
                continue
            signal_breakdown.append(
                {
                    "signal": signal,
                    "value": _to_float(entry.get("value"), 0.0),
                    "impact": _to_float(entry.get("impact"), 0.0),
                }
            )

    confidence_breakdown_raw = payload.get("confidence_breakdown")
    confidence_breakdown: dict[str, float] | None = None
    if isinstance(confidence_breakdown_raw, dict):
        confidence_breakdown = {
            "model_fit_score": _to_float(confidence_breakdown_raw.get("model_fit_score"), 0.0),
            "raw_confidence": _to_float(confidence_breakdown_raw.get("raw_confidence"), 0.0),
            "final_confidence": _to_float(confidence_breakdown_raw.get("final_confidence"), 0.0),
            "zero_adjustment_penalty": _to_float(confidence_breakdown_raw.get("zero_adjustment_penalty"), 0.0),
            "predicted_adjustment": _to_float(confidence_breakdown_raw.get("predicted_adjustment"), 0.0),
            "explained_sum": _to_float(confidence_breakdown_raw.get("explained_sum"), 0.0),
            "reconciliation_delta": _to_float(confidence_breakdown_raw.get("reconciliation_delta"), 0.0),
        }

    return AiRecommendation(
        reservation_id=str(payload.get("reservation_id") or reservation_id),
        pricing_adjustment=_to_float(payload.get("pricing_adjustment"), 0.0),
        confidence=max(0.0, min(1.0, _to_float(payload.get("confidence"), 0.0))),
        explanations=explanations,
        suggested_multiplier=_to_float(payload.get("suggested_multiplier"), 0.0) if payload.get("suggested_multiplier") is not None else None,
        demand_bucket=str(payload.get("demand_bucket")) if payload.get("demand_bucket") in {"low", "normal", "high"} else None,
        signal_breakdown=signal_breakdown,
        confidence_breakdown=confidence_breakdown,
    )


def get_pricing_recommendation(
    *,
    reservation_id: str,
    context: dict[str, Any],
    allow_remote: bool = True,
) -> AiRecommendation:
    context = enrich_pricing_context(context)
    started_at = perf_counter()
    if not allow_remote or not settings.ai_service_base_url:
        recommendation = _fallback_recommendation(
            reservation_id=reservation_id,
            context=context,
            reason="AI service is not configured.",
        )
        ai_pricing_metrics.record(
            duration_ms=(perf_counter() - started_at) * 1000,
            used_fallback=True,
            fallback_reason="AI service is not configured.",
        )
        return recommendation

    endpoint = f"{settings.ai_service_base_url.rstrip('/')}/v1/pricing/recommendation"
    # Respect env-configured timeout budget (ms) while keeping a hard safety cap.
    timeout_sec = max(0.05, min(settings.ai_inference_timeout_ms, 10_000) / 1000)
    body = json.dumps(
        {
            "reservation_id": reservation_id,
            "context": context,
        }
    ).encode("utf-8")
    request = Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout_sec) as response:  # noqa: S310
            raw = response.read().decode("utf-8")
            payload = json.loads(raw) if raw else {}
            recommendation = _extract_recommendation(reservation_id=reservation_id, payload=payload)
            if recommendation is not None:
                ai_pricing_metrics.record(
                    duration_ms=(perf_counter() - started_at) * 1000,
                    used_fallback=False,
                )
                return recommendation
            fallback_reason = "AI service response schema invalid."
            recommendation = _fallback_recommendation(
                reservation_id=reservation_id,
                context=context,
                reason=fallback_reason,
            )
            ai_pricing_metrics.record(
                duration_ms=(perf_counter() - started_at) * 1000,
                used_fallback=True,
                fallback_reason=fallback_reason,
            )
            return recommendation
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("AI pricing fallback used (%s).", exc)
        fallback_reason = f"AI service unavailable: {exc}"
        recommendation = _fallback_recommendation(
            reservation_id=reservation_id,
            context=context,
            reason=fallback_reason,
        )
        ai_pricing_metrics.record(
            duration_ms=(perf_counter() - started_at) * 1000,
            used_fallback=True,
            fallback_reason=fallback_reason,
        )
        return recommendation


def _fallback_occupancy_forecast(
    *,
    start_date: str,
    horizon_days: int,
    history: list[dict[str, Any]],
    reason: str,
) -> dict[str, Any]:
    parsed_start = date.fromisoformat(start_date)
    history_values: list[float] = []
    for entry in history:
        history_values.append(max(0.0, _to_float(entry.get("occupancy"), 0.0)))
    baseline = (sum(history_values) / len(history_values)) if history_values else 0.0

    items: list[dict[str, Any]] = []
    for step in range(horizon_days):
        target = parsed_start + timedelta(days=step)
        weekend_uplift = 0.15 if target.weekday() >= 5 else 0.0
        items.append(
            {
                "date": target.isoformat(),
                "occupancy": round(max(0.0, baseline * (1 + weekend_uplift)), 2),
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "start_date": parsed_start.isoformat(),
        "horizon_days": horizon_days,
        "model_version": "fallback-mean-weekend-v1",
        "source": "hillside-api-fallback",
        "items": items,
        "notes": [f"Fallback forecast used: {reason}"],
    }


def get_occupancy_forecast(
    *,
    start_date: str,
    horizon_days: int,
    history: list[dict[str, Any]],
    allow_remote: bool = True,
) -> dict[str, Any]:
    started_at = perf_counter()
    if not allow_remote or not settings.ai_service_base_url:
        fallback = _fallback_occupancy_forecast(
            start_date=start_date,
            horizon_days=horizon_days,
            history=history,
            reason="AI service is not configured.",
        )
        ai_forecast_metrics.record(
            duration_ms=(perf_counter() - started_at) * 1000,
            used_fallback=True,
            fallback_reason="AI service is not configured.",
        )
        return fallback

    endpoint = f"{settings.ai_service_base_url.rstrip('/')}/v1/occupancy/forecast"
    timeout_sec = max(0.05, min(settings.ai_inference_timeout_ms, 10_000) / 1000)
    body = json.dumps(
        {
            "start_date": start_date,
            "horizon_days": horizon_days,
            "history": history,
        }
    ).encode("utf-8")
    request = Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout_sec) as response:  # noqa: S310
            raw = response.read().decode("utf-8")
            payload = json.loads(raw) if raw else {}
            if isinstance(payload, dict) and isinstance(payload.get("items"), list):
                ai_forecast_metrics.record(
                    duration_ms=(perf_counter() - started_at) * 1000,
                    used_fallback=False,
                )
                return payload
            fallback_reason = "AI service response schema invalid."
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("AI occupancy fallback used (%s).", exc)
        fallback_reason = f"AI service unavailable: {exc}"

    fallback = _fallback_occupancy_forecast(
        start_date=start_date,
        horizon_days=horizon_days,
        history=history,
        reason=fallback_reason,
    )
    ai_forecast_metrics.record(
        duration_ms=(perf_counter() - started_at) * 1000,
        used_fallback=True,
        fallback_reason=fallback_reason,
    )
    return fallback


def get_ai_pricing_metrics_snapshot() -> dict[str, Any]:
    return ai_pricing_metrics.snapshot()


def _fallback_concierge(
    *,
    segment_key: str,
    stay_type: str | None,
    reason: str,
) -> dict[str, Any]:
    normalized = str(segment_key or "family_weekend").strip().lower().replace(" ", "_")
    suggestions_map = {
        "family_weekend": [
            {
                "code": "tour_day_family",
                "title": "Family Day Tour Bundle",
                "description": "Kid-friendly paced day tour.",
                "reasons": [
                    "Fallback model used (non-blocking).",
                    reason,
                    "Segment profile indicates family-oriented itinerary preference.",
                ],
            },
            {
                "code": "dining_poolside",
                "title": "Poolside Dining Slot",
                "description": "Early dinner recommendation near amenity zone.",
                "reasons": ["Matches family segment patterns in anonymized behavior."],
            },
        ],
        "couple_escape": [
            {
                "code": "tour_sunset_pair",
                "title": "Sunset Pair Tour",
                "description": "Low-crowd evening itinerary for two.",
                "reasons": ["Fallback model used (non-blocking).", reason],
            },
            {
                "code": "dining_quiet_deck",
                "title": "Quiet Deck Dinner",
                "description": "Recommended quieter dining schedule.",
                "reasons": ["Segment profile indicates preference for low-noise settings."],
            },
        ],
        "barkada_daytrip": [
            {
                "code": "tour_group_combo",
                "title": "Group Adventure Combo",
                "description": "High-energy group daytime itinerary.",
                "reasons": ["Fallback model used (non-blocking).", reason],
            },
            {
                "code": "snack_station",
                "title": "Snack Station Add-on",
                "description": "Quick-stop recommendation for larger groups.",
                "reasons": ["Common preference for daytrip groups."],
            },
        ],
    }
    suggestions = suggestions_map.get(normalized, suggestions_map["family_weekend"])
    return {
        "segment_key": normalized,
        "stay_type": stay_type,
        "suggestions": suggestions,
        "notes": [
            "Concierge fallback strategy used.",
            "Recommendations are generated from anonymized segment behavior.",
        ],
        "model_version": "fallback-rules-concierge-v1",
    }


def get_concierge_recommendation(
    *,
    segment_key: str,
    stay_type: str | None,
    behavior: dict[str, Any] | None = None,
    allow_remote: bool = True,
) -> dict[str, Any]:
    started_at = perf_counter()
    if not allow_remote or not settings.ai_service_base_url:
        output = _fallback_concierge(
            segment_key=segment_key,
            stay_type=stay_type,
            reason="AI service is not configured.",
        )
        ai_concierge_metrics.record(
            duration_ms=(perf_counter() - started_at) * 1000,
            used_fallback=True,
            fallback_reason="AI concierge service is not configured.",
        )
        return output

    endpoint = f"{settings.ai_service_base_url.rstrip('/')}/v1/concierge/recommendation"
    timeout_sec = max(0.05, min(settings.ai_inference_timeout_ms, 10_000) / 1000)
    body = json.dumps(
        {
            "segment_key": segment_key,
            "stay_type": stay_type,
            "behavior": behavior or {},
        }
    ).encode("utf-8")
    request = Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout_sec) as response:  # noqa: S310
            raw = response.read().decode("utf-8")
            payload = json.loads(raw) if raw else {}
            if isinstance(payload, dict) and isinstance(payload.get("suggestions"), list):
                ai_concierge_metrics.record(
                    duration_ms=(perf_counter() - started_at) * 1000,
                    used_fallback=False,
                )
                return payload
            fallback_reason = "AI concierge response schema invalid."
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("AI concierge fallback used (%s).", exc)
        fallback_reason = f"AI concierge service unavailable: {exc}"

    output = _fallback_concierge(
        segment_key=segment_key,
        stay_type=stay_type,
        reason=fallback_reason,
    )
    ai_concierge_metrics.record(
        duration_ms=(perf_counter() - started_at) * 1000,
        used_fallback=True,
        fallback_reason=fallback_reason,
    )
    return output
