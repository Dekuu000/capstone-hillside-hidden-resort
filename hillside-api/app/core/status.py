from __future__ import annotations

import re
from typing import Any

CANONICAL_BOOKING_STATUSES = {
    "draft",
    "pending_payment",
    "escrow_locked",
    "for_verification",
    "confirmed",
    "checked_in",
    "checked_out",
    "cancelled",
    "no_show",
}

_BOOKING_STATUS_ALIASES = {
    "pendingpayment": "pending_payment",
    "pending_payment": "pending_payment",
    "pending_payment_": "pending_payment",
    "forverification": "for_verification",
    "for_verification": "for_verification",
    "forverification_": "for_verification",
    "checkedin": "checked_in",
    "checked_in": "checked_in",
    "checkedout": "checked_out",
    "checked_out": "checked_out",
    "noshow": "no_show",
    "no_show": "no_show",
}


def canonical_booking_status(value: Any) -> str:
    if value is None:
        return "pending_payment"

    raw = str(value).strip()
    if not raw:
        return "pending_payment"

    token = raw.lower()
    token = re.sub(r"[\s\-]+", "_", token)
    token = re.sub(r"_+", "_", token).strip("_")

    mapped = _BOOKING_STATUS_ALIASES.get(token, token)
    if mapped in CANONICAL_BOOKING_STATUSES:
        return mapped

    # Keep API responses valid even when legacy/custom values exist in old rows.
    return "pending_payment"


def normalize_reservation_status_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    if "status" in normalized:
        normalized["status"] = canonical_booking_status(normalized.get("status"))
    return normalized

