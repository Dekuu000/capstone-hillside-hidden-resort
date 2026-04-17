from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.integrations.ai_pricing import get_concierge_recommendation
from app.integrations.supabase_client import (
    create_or_get_guest_welcome_notification,
    get_anonymized_concierge_behavior,
    insert_ai_concierge_suggestion,
)


@dataclass(frozen=True)
class CheckinWelcomeSummary:
    created: bool
    notification_id: str | None
    fallback_used: bool
    model_version: str | None


def _derive_segment_key(*, guest_count: int, stay_type: str) -> str:
    if guest_count >= 5:
        return "barkada_daytrip"
    if guest_count <= 2:
        return "couple_escape"
    if stay_type == "tour":
        return "barkada_daytrip"
    return "family_weekend"


def _derive_stay_type(reservation_row: dict[str, Any]) -> str:
    service_bookings = reservation_row.get("service_bookings") or []
    if isinstance(service_bookings, list) and service_bookings:
        return "tour"
    return "stay"


def _normalize_suggestions(raw: object, *, limit: int) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    if not isinstance(raw, list):
        return normalized

    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        description = str(item.get("description") or "").strip()
        if not title and not description:
            continue
        reasons_raw = item.get("reasons")
        reasons = [str(entry) for entry in reasons_raw if str(entry).strip()] if isinstance(reasons_raw, list) else []
        normalized.append(
            {
                "code": str(item.get("code") or f"suggestion_{index + 1}"),
                "title": title or "Recommended experience",
                "description": description or "Suggested based on your stay profile.",
                "reasons": reasons[:3],
            }
        )
        if len(normalized) >= max(1, limit):
            break

    return normalized


def _fallback_suggestions(*, stay_type: str) -> list[dict[str, Any]]:
    if stay_type == "tour":
        return [
            {
                "code": "tour_trail_bundle",
                "title": "Hillside Hidden Trail Bundle",
                "description": "Recommended route for first-time tour guests.",
                "reasons": ["Fallback suggestions used while AI is unavailable."],
            },
            {
                "code": "tour_dining_slot",
                "title": "Post-tour Dining Slot",
                "description": "Reserve a dining slot after your tour window.",
                "reasons": ["Matches typical daytour pacing at the resort."],
            },
        ]
    return [
        {
            "code": "stay_poolside_evening",
            "title": "Poolside Evening Experience",
            "description": "Relaxed welcome plan for your first night.",
            "reasons": ["Fallback suggestions used while AI is unavailable."],
        },
        {
            "code": "stay_family_day",
            "title": "Family Day Tour Bundle",
            "description": "Balanced itinerary with dining and activities.",
            "reasons": ["Popular for newly checked-in guests."],
        },
    ]


def create_checkin_welcome_notification(
    *,
    reservation_row: dict[str, Any],
    created_by_user_id: str,
) -> CheckinWelcomeSummary | None:
    if not settings.feature_checkin_welcome_notification:
        return None

    reservation_id = str(reservation_row.get("reservation_id") or "").strip()
    guest_user_id = str(reservation_row.get("guest_user_id") or "").strip()
    if not reservation_id or not guest_user_id:
        return None

    stay_type = _derive_stay_type(reservation_row)
    guest_count = int(reservation_row.get("guest_count") or 1)
    segment_key = _derive_segment_key(guest_count=guest_count, stay_type=stay_type)

    try:
        behavior = get_anonymized_concierge_behavior(days=120)
    except RuntimeError:
        behavior = {}

    try:
        result = get_concierge_recommendation(
            segment_key=segment_key,
            stay_type=stay_type,
            behavior=behavior,
            allow_remote=True,
        )
    except Exception:  # noqa: BLE001
        result = {
            "source": "hillside-api-fallback",
            "model_version": "fallback-rules-concierge-v1",
            "suggestions": _fallback_suggestions(stay_type=stay_type),
        }
    suggestions = _normalize_suggestions(
        result.get("suggestions") if isinstance(result, dict) else [],
        limit=max(1, int(settings.checkin_welcome_suggestions_limit)),
    )
    if not suggestions:
        suggestions = _normalize_suggestions(
            _fallback_suggestions(stay_type=stay_type),
            limit=max(1, int(settings.checkin_welcome_suggestions_limit)),
        )
    model_version = str(result.get("model_version")) if isinstance(result, dict) and result.get("model_version") else None
    source = str(result.get("source") or "hillside-ai") if isinstance(result, dict) else "hillside-ai"
    fallback_used = bool(
        ("fallback" in (model_version or "").lower())
        or ("fallback" in source.lower())
    )

    title = "Welcome to Hillside Resort"
    if suggestions:
        message = f"You are checked in. {suggestions[0]['title']} is recommended for your stay."
    else:
        message = "You are checked in. Explore tours curated for your stay."

    row, created = create_or_get_guest_welcome_notification(
        reservation_id=reservation_id,
        guest_user_id=guest_user_id,
        title=title,
        message=message,
        suggestions=suggestions,
        model_version=model_version,
        source=source,
        fallback_used=fallback_used,
        metadata={
            "segment_key": segment_key,
            "stay_type": stay_type,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    try:
        insert_ai_concierge_suggestion(
            created_by_user_id=created_by_user_id,
            segment_key=segment_key,
            stay_type=stay_type,
            model_version=model_version or "unknown",
            source=source,
            behavior=behavior,
            suggestions=suggestions,
            notes=[
                "Triggered during check-in welcome notification.",
                "Suggestions are personalized from anonymized behavior patterns.",
            ],
        )
    except RuntimeError:
        # Non-blocking analytics write.
        pass

    notification_id = str(row.get("notification_id") or "") if isinstance(row, dict) else ""
    return CheckinWelcomeSummary(
        created=bool(created),
        notification_id=notification_id or None,
        fallback_used=fallback_used,
        model_version=model_version,
    )
