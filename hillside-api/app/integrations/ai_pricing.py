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

    if is_weekend:
        adjustment += round(max(20.0, baseline * 0.04), 2)
        explanations.append("Weekend demand uplift applied in fallback policy.")

    if party_size >= 4 and not is_tour:
        adjustment += round(max(10.0, baseline * 0.02), 2)
        explanations.append("Large-party occupancy signal applied in fallback policy.")

    confidence = 0.4 if adjustment else 0.35
    return AiRecommendation(
        reservation_id=reservation_id,
        pricing_adjustment=round(adjustment, 2),
        confidence=confidence,
        explanations=explanations,
    )


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

    return AiRecommendation(
        reservation_id=str(payload.get("reservation_id") or reservation_id),
        pricing_adjustment=_to_float(payload.get("pricing_adjustment"), 0.0),
        confidence=max(0.0, min(1.0, _to_float(payload.get("confidence"), 0.0))),
        explanations=explanations,
    )


def get_pricing_recommendation(
    *,
    reservation_id: str,
    context: dict[str, Any],
    allow_remote: bool = True,
) -> AiRecommendation:
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
        ai_pricing_metrics.record(
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
                ai_pricing_metrics.record(
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
    ai_pricing_metrics.record(
        duration_ms=(perf_counter() - started_at) * 1000,
        used_fallback=True,
        fallback_reason=fallback_reason,
    )
    return fallback


def get_ai_pricing_metrics_snapshot() -> dict[str, Any]:
    return ai_pricing_metrics.snapshot()
