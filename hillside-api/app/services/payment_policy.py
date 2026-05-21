from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


CancellationActor = Literal["guest", "admin"]
PolicyOutcome = Literal["forfeited", "refunded"]


@dataclass(frozen=True)
class CancellationPolicyDecision:
    actor: CancellationActor
    outcome: PolicyOutcome
    paid_amount: float
    minimum_deposit: float
    refundable_amount: float
    non_refundable_amount: float


def _safe_amount(value: object) -> float:
    try:
        parsed = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, parsed)


def normalize_cancellation_actor(actor_role: str) -> CancellationActor:
    role = str(actor_role or "").strip().lower()
    if role in {"admin", "system"}:
        return "admin"
    return "guest"


def resolve_cancellation_policy(
    *,
    actor_role: str,
    paid_amount: object,
    minimum_deposit: object,
) -> CancellationPolicyDecision:
    actor = normalize_cancellation_actor(actor_role)
    paid = _safe_amount(paid_amount)
    min_deposit = _safe_amount(minimum_deposit)

    if actor == "admin":
        outcome: PolicyOutcome = "refunded"
        refundable = paid
        non_refundable = 0.0
    else:
        outcome = "forfeited"
        non_refundable = min(paid, min_deposit)
        refundable = max(0.0, paid - non_refundable)

    return CancellationPolicyDecision(
        actor=actor,
        outcome=outcome,
        paid_amount=paid,
        minimum_deposit=min_deposit,
        refundable_amount=refundable,
        non_refundable_amount=non_refundable,
    )


def payment_satisfies_minimum(*, amount_paid_verified: object, minimum_required: object) -> bool:
    return _safe_amount(amount_paid_verified) >= _safe_amount(minimum_required)

