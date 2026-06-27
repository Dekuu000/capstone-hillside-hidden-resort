import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.api.v2.routes._http_errors import raise_http_from_runtime_error

from app.core.auth import (
    AuthContext,
    ensure_reservation_access,
    require_admin,
    require_authenticated,
    require_operations,
)
from app.core.config import settings
from app.integrations.supabase_client import (
    attach_paymongo_checkout,
    create_gateway_payment,
    get_payment_by_id,
    set_paymongo_payment_id,
    expire_pending_payment_hold_for_reservation,
    get_payment_by_reference_no,
    get_reservation_by_id,
    list_admin_payments,
    list_payments_by_reservation,
    notify_guest_payment_decision,
    notify_ops_payment_proof,
    notify_ops_payment_received,
    record_on_site_payment as record_on_site_payment_rpc,
    reject_payment as reject_payment_rpc,
    reject_payment_service_role,
    submit_payment_proof as submit_payment_proof_rpc,
    update_reservation_policy_metadata,
    update_payment_intent_amount as update_payment_intent_amount_rpc,
    verify_payment as verify_payment_rpc,
    verify_payment_service_role,
)
from app.schemas.common import (
    AdminPaymentsResponse,
    OnSitePaymentRequest,
    OnSitePaymentResponse,
    PaymentIntentUpdateRequest,
    PaymentRejectRequest,
    PaymentSubmissionRequest,
    PaymentSubmissionResponse,
    RejectPaymentResponse,
    VerifyPaymentResponse,
)
from app.services.idempotency import (
    build_idempotency_operation_id,
    load_cached_response_payload,
    store_operation_receipt_safely,
)
from app.services import paymongo
from app.services.payment_policy import payment_satisfies_minimum
from app.services.payment_webhooks import (
    parse_payment_webhook_payload,
    verify_webhook_signature,
)

router = APIRouter()


class PaymongoCheckoutRequest(BaseModel):
    reservation_id: str
    payment_type: str = "deposit"
logger = logging.getLogger(__name__)
WEBHOOK_ROUTE_KEY = "payments.webhooks.provider"
WEBHOOK_SYSTEM_USER_ID = "system-webhook"


def _parse_created_at_utc(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        created_at = datetime.fromisoformat(text)
    except ValueError:
        return None
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at.astimezone(timezone.utc)


def _pending_payment_hold_cutoff_utc() -> datetime:
    hold_minutes = max(5, int(settings.reservation_pending_payment_hold_minutes or 120))
    return datetime.now(timezone.utc) - timedelta(minutes=hold_minutes)


def _should_expire_pending_payment_hold(reservation: dict) -> bool:
    status_text = str(reservation.get("status") or "").lower()
    if status_text != "pending_payment":
        return False
    amount_paid = float(reservation.get("amount_paid_verified") or 0)
    if amount_paid > 0:
        return False
    created_at = _parse_created_at_utc(reservation.get("created_at"))
    if created_at is None:
        return False
    return created_at < _pending_payment_hold_cutoff_utc()


def _enforce_payment_window_or_raise(*, reservation: dict, reservation_id: str) -> None:
    if not _should_expire_pending_payment_hold(reservation):
        return
    try:
        expired = expire_pending_payment_hold_for_reservation(
            reservation_id=reservation_id,
            older_than_utc=_pending_payment_hold_cutoff_utc(),
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return

    if expired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This payment window has expired because the minimum deposit was not submitted in time. "
                "Please create a new reservation."
            ),
        )


@router.get("/reservations/{reservation_id}")
def get_reservation_payments(
    reservation_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        reservation = get_reservation_by_id(reservation_id)
        if not reservation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
        ensure_reservation_access(auth, reservation)
        rows, total = list_payments_by_reservation(
            reservation_id=reservation_id,
            limit=limit,
            offset=offset,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return {
        "items": rows,
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


@router.get("", response_model=AdminPaymentsResponse)
def get_admin_payments(
    tab: str = Query(default="to_review", pattern="^(to_review|verified|rejected|all)$"),
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=120),
    method: str | None = Query(default=None, pattern="^(cash|gcash|bank|card)$"),
    from_ts: str | None = Query(default=None, alias="from"),
    to_ts: str | None = Query(default=None, alias="to"),
    source: str | None = Query(default=None, pattern="^(online|walk_in)$"),
    settlement: str | None = Query(default=None, pattern="^(paid|partial)$"),
    _auth: AuthContext = Depends(require_admin),
):
    try:
        rows, total = list_admin_payments(
            tab=tab,
            limit=limit,
            offset=offset,
            search=search,
            method_filter=method,
            from_ts=from_ts,
            to_ts=to_ts,
            source_filter=source,
            settlement_filter=settlement,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return {
        "items": rows,
        "count": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


@router.post("/submissions", response_model=PaymentSubmissionResponse)
def submit_payment(
    payload: PaymentSubmissionRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    operation_id = build_idempotency_operation_id(
        route_key="payments.submissions.create",
        user_id=auth.user_id,
        idempotency_key=payload.idempotency_key,
    )
    cached_payload = load_cached_response_payload(
        operation_id=operation_id,
        user_id=auth.user_id,
        idempotency_key=payload.idempotency_key,
        logger=logger,
        warning_label="Payment",
    )
    if cached_payload:
        return PaymentSubmissionResponse(
            payment_id=str(cached_payload.get("payment_id") or "submitted"),
            status=str(cached_payload.get("status") or "pending"),
            reservation_status=str(cached_payload.get("reservation_status") or "for_verification"),
        )

    proof_url = (payload.proof_url or "").strip()
    if not proof_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="proof_url is required.",
        )

    try:
        reservation = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    ensure_reservation_access(auth, reservation)
    _enforce_payment_window_or_raise(
        reservation=reservation,
        reservation_id=payload.reservation_id,
    )

    reservation_status = str(reservation.get("status") or "").lower()
    if reservation_status in {"cancelled", "no_show", "checked_out"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment submission is not allowed for this reservation status.",
        )

    # Front-load minimum payment validation for clearer guest-facing errors.
    # The RPC layer enforces these rules too; this keeps API feedback explicit.
    deposit_required = float(reservation.get("deposit_required") or 0)
    expected_pay_now = float(reservation.get("expected_pay_now") or 0)
    minimum_required = expected_pay_now if expected_pay_now > 0 else deposit_required
    if minimum_required > 0 and payload.amount < minimum_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Minimum payment for this reservation is {minimum_required:.2f}. "
                "Pay at least the minimum deposit before continuing."
            ),
        )

    try:
        result = submit_payment_proof_rpc(
            access_token=auth.access_token,
            reservation_id=payload.reservation_id,
            payment_type=payload.payment_type,
            amount=payload.amount,
            method=payload.method,
            reference_no=payload.reference_no,
            proof_url=proof_url,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_400_BAD_REQUEST)

    if isinstance(result, str):
        payment_id = result
    elif isinstance(result, list) and result:
        payment_id = str(result[0])
    else:
        payment_id = "submitted"
    try:
        refreshed = get_reservation_by_id(payload.reservation_id)
    except RuntimeError:
        refreshed = None
    refreshed_status = str((refreshed or reservation).get("status") or "").strip().lower()
    next_status = "for_verification" if refreshed_status in {"", "pending_payment"} else refreshed_status
    total_paid_verified = float((refreshed or reservation).get("amount_paid_verified") or 0)
    if minimum_required > 0 and payment_satisfies_minimum(
        amount_paid_verified=total_paid_verified,
        minimum_required=minimum_required,
    ):
        next_status = "confirmed" if next_status in {"pending_payment", "for_verification"} else next_status

    notify_ops_payment_proof(reservation=(refreshed or reservation), payment_id=payment_id)
    response = PaymentSubmissionResponse(
        payment_id=payment_id,
        status="pending",
        reservation_status=next_status,
    )
    store_operation_receipt_safely(
        operation_id=operation_id,
        idempotency_key=payload.idempotency_key,
        user_id=auth.user_id,
        entity_type="payment_submission",
        entity_id=payment_id,
        action="payments.submissions.create",
        response_payload=response.model_dump(mode="json"),
        logger=logger,
        warning_label="Payment",
    )
    return response


@router.post("/intent")
def update_payment_intent(
    payload: PaymentIntentUpdateRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        reservation = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    ensure_reservation_access(auth, reservation)
    _enforce_payment_window_or_raise(
        reservation=reservation,
        reservation_id=payload.reservation_id,
    )

    reservation_status = str(reservation.get("status") or "").lower()
    if reservation_status not in {"pending_payment", "for_verification"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot update payment intent for this reservation status.",
        )

    if payload.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be greater than zero.",
        )

    try:
        update_payment_intent_amount_rpc(
            access_token=auth.access_token,
            reservation_id=payload.reservation_id,
            amount=payload.amount,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return {"ok": True}


@router.post("/paymongo/checkout")
def create_paymongo_checkout(
    payload: PaymongoCheckoutRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    """Create a PayMongo Hosted Checkout (GCash) session for a reservation's
    deposit and return the redirect URL. The amount is recomputed server-side;
    the booking is only marked paid later by the verified webhook."""
    if str(settings.payment_mode or "").strip().lower() != "gateway":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Online payment is currently unavailable.",
        )
    if not paymongo.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Online payment is not configured.",
        )

    try:
        reservation = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    ensure_reservation_access(auth, reservation)
    _enforce_payment_window_or_raise(reservation=reservation, reservation_id=payload.reservation_id)

    reservation_status = str(reservation.get("status") or "").lower()
    if reservation_status not in {"pending_payment", "for_verification"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This reservation is not awaiting payment.",
        )

    # Never trust a client amount — recompute the amount due now from the booking.
    expected = reservation.get("expected_pay_now")
    deposit = reservation.get("deposit_required")
    amount_php = float(expected if expected not in (None, "") else (deposit or 0))
    if amount_php <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No payment is currently due for this reservation.",
        )
    amount_centavos = paymongo.php_to_centavos(amount_php)
    reservation_code = str(reservation.get("reservation_code") or "")
    reference_no = f"PM-{payload.reservation_id[:8]}-{uuid4().hex[:8]}"

    try:
        payment = create_gateway_payment(
            reservation_id=payload.reservation_id,
            amount=amount_php,
            reference_no=reference_no,
            method="gcash",
            payment_type="deposit",
            provider="paymongo",
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)
    payment_id = str(payment.get("payment_id") or "")

    base = str(settings.app_public_base_url or "http://localhost:3000").rstrip("/")
    success_url = f"{base}/reserve/{payload.reservation_id}/pay/success"
    cancel_url = f"{base}/reserve/{payload.reservation_id}/pay/cancelled"

    try:
        session = paymongo.create_gcash_checkout_session(
            amount_centavos=amount_centavos,
            description=f"Hillside reservation {reservation_code} deposit",
            line_item_name=f"Reservation {reservation_code} deposit",
            reference_number=reference_no,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "reservation_id": payload.reservation_id,
                "reservation_code": reservation_code,
                "payment_id": payment_id,
                "reference_no": reference_no,
                "amount_centavos": amount_centavos,
                "guest_user_id": str(reservation.get("guest_user_id") or ""),
            },
        )
    except paymongo.PayMongoError as exc:
        logger.warning("PayMongo checkout creation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start the GCash payment. Please try again.",
        ) from exc

    try:
        attach_paymongo_checkout(
            payment_id=payment_id,
            checkout_session_id=session["checkout_session_id"],
            checkout_url=session["checkout_url"],
            payment_intent_id=session.get("payment_intent_id"),
        )
    except RuntimeError as exc:
        logger.warning("Failed to persist PayMongo checkout refs: %s", exc)

    return {
        "ok": True,
        "checkout_url": session["checkout_url"],
        "checkout_session_id": session["checkout_session_id"],
        "payment_id": payment_id,
    }


@router.post("/on-site", response_model=OnSitePaymentResponse)
def record_on_site_payment(
    payload: OnSitePaymentRequest,
    auth: AuthContext = Depends(require_operations),
):
    operation_id: str | None = None
    if payload.idempotency_key:
        operation_id = build_idempotency_operation_id(
            route_key="payments.on_site.create",
            user_id=auth.user_id,
            idempotency_key=payload.idempotency_key,
        )
        cached_payload = load_cached_response_payload(
            operation_id=operation_id,
            user_id=auth.user_id,
            idempotency_key=payload.idempotency_key,
            logger=logger,
            warning_label="On-site payment",
        )
        if cached_payload:
            return OnSitePaymentResponse(
                ok=True,
                payment_id=str(cached_payload.get("payment_id") or "recorded"),
                status=str(cached_payload.get("status") or "verified"),
                reservation_status=str(cached_payload.get("reservation_status") or "confirmed"),
            )

    if payload.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be greater than zero.",
        )

    try:
        reservation = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    _enforce_payment_window_or_raise(
        reservation=reservation,
        reservation_id=payload.reservation_id,
    )

    reservation_status = str(reservation.get("status") or "").lower()
    if reservation_status in {"cancelled", "no_show", "checked_out"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="On-site payment is not allowed for this reservation status.",
        )

    try:
        result = record_on_site_payment_rpc(
            access_token=auth.access_token,
            reservation_id=payload.reservation_id,
            amount=payload.amount,
            method=payload.method,
            reference_no=payload.reference_no,
        )
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_400_BAD_REQUEST)

    payment_id = "recorded"
    payment_status = "verified"
    if isinstance(result, str):
        payment_id = result
    elif isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict):
            payment_id = str(first.get("payment_id") or payment_id)
            payment_status = str(first.get("status") or payment_status)
        else:
            payment_id = str(first)
    elif isinstance(result, dict):
        payment_id = str(result.get("payment_id") or payment_id)
        payment_status = str(result.get("status") or payment_status)

    try:
        refreshed = get_reservation_by_id(payload.reservation_id)
    except RuntimeError:
        refreshed = None
    next_status = str((refreshed or reservation).get("status") or reservation_status)

    response = {
        "ok": True,
        "payment_id": payment_id,
        "status": payment_status,
        "reservation_status": next_status,
    }
    if payload.idempotency_key and operation_id:
        store_operation_receipt_safely(
            operation_id=operation_id,
            idempotency_key=payload.idempotency_key,
            user_id=auth.user_id,
            entity_type="payment_submission",
            entity_id=payment_id,
            action="payments.on_site.create",
            response_payload=response,
            logger=logger,
            warning_label="On-site payment",
        )
    return response


@router.post("/{payment_id}/verify", response_model=VerifyPaymentResponse)
def verify_payment(payment_id: str, auth: AuthContext = Depends(require_admin)):
    try:
        verify_payment_rpc(payment_id, access_token=auth.access_token, approved=True)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)
    notify_guest_payment_decision(payment_id=payment_id, approved=True)
    return {"ok": True, "payment_id": payment_id, "status": "verified"}


@router.post("/{payment_id}/reject", response_model=RejectPaymentResponse)
def reject_payment(
    payment_id: str,
    payload: PaymentRejectRequest,
    auth: AuthContext = Depends(require_admin),
):
    reason = payload.reason.strip()
    if len(reason) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reason must be at least 5 characters.",
        )
    try:
        reject_payment_rpc(payment_id, access_token=auth.access_token, reason=reason)
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    notify_guest_payment_decision(payment_id=payment_id, approved=False)
    return {
        "ok": True,
        "payment_id": payment_id,
        "status": "rejected",
        "reason": reason,
    }


@router.post("/webhooks/provider")
async def process_payment_webhook(
    request: Request,
):
    payment_mode = str(settings.payment_mode or "proof_only").strip().lower()
    if payment_mode != "gateway":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment gateway webhooks are disabled in proof-only mode.",
        )
    # Read the RAW body first — PayMongo's HMAC signature is computed over it.
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body or b"{}")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Webhook payload must be an object.")

    normalized = parse_payment_webhook_payload(payload, request=request)
    if normalized.provider == "paymongo":
        if not paymongo.verify_webhook_signature(
            raw_body=raw_body,
            signature_header=str(request.headers.get("paymongo-signature") or ""),
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid PayMongo webhook signature.",
            )
    else:
        verify_webhook_signature(request=request, provider=normalized.provider)

    provider = normalized.provider
    event_id = normalized.event_id
    event_type = normalized.event_type
    if not event_id or not event_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="event_id and event_type are required.",
        )

    operation_id = build_idempotency_operation_id(
        route_key=WEBHOOK_ROUTE_KEY,
        user_id=WEBHOOK_SYSTEM_USER_ID,
        idempotency_key=event_id,
    )
    cached_payload = load_cached_response_payload(
        operation_id=operation_id,
        user_id=WEBHOOK_SYSTEM_USER_ID,
        idempotency_key=event_id,
        logger=logger,
        warning_label="Payment webhook",
    )
    if cached_payload:
        return {
            "ok": True,
            "provider": provider,
            "event_id": event_id,
            "event_type": event_type,
            "deduped": True,
            "dedupe_result": "deduped",
            **cached_payload,
        }

    payment_id = str(normalized.payment_id or "").strip()
    reservation_id = str(normalized.reservation_id or "").strip()
    reference_no = str(normalized.reference_no or "").strip()
    reason = str(normalized.reason or "Webhook rejection").strip()
    processed = "ignored"

    if not payment_id and reference_no:
        try:
            payment_by_ref = get_payment_by_reference_no(reference_no=reference_no)
        except RuntimeError as exc:
            raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)
            return
        if payment_by_ref:
            payment_id = str(payment_by_ref.get("payment_id") or "").strip()
            reservation_id = reservation_id or str(payment_by_ref.get("reservation_id") or "").strip()

    # Current payment status — providers (PayMongo) send multiple events + retry,
    # so we must treat an already-resolved payment as a no-op (return 200), not error.
    current_status = ""
    if payment_id:
        try:
            current = get_payment_by_id(payment_id=payment_id)
            current_status = str((current or {}).get("status") or "").lower()
        except RuntimeError:
            current_status = ""

    try:
        if event_type in {"payment.succeeded", "payment.verified"} and payment_id:
            if current_status == "verified":
                processed = "already_verified"
            elif current_status == "rejected":
                processed = "ignored_rejected"
            else:
                verify_payment_service_role(payment_id, approved=True)
                processed = "payment_verified"
            # Record the PayMongo payment id for audit/reconciliation.
            if normalized.provider_payment_id:
                try:
                    set_paymongo_payment_id(
                        payment_id=payment_id,
                        provider_payment_id=normalized.provider_payment_id,
                    )
                except RuntimeError:
                    logger.warning("Could not store PayMongo payment id for %s", payment_id)
            # Deposit is paid → lock escrow now (shadow-write, or on-chain when
            # FEATURE_ESCROW_ONCHAIN_LOCK is enabled). Idempotent + non-blocking.
            if reservation_id and processed in {"payment_verified", "already_verified"}:
                try:
                    from app.api.v2.routes.reservations import _maybe_apply_escrow_shadow_write

                    _maybe_apply_escrow_shadow_write(reservation_id)
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Escrow lock after payment failed (reservation_id=%s)",
                        reservation_id,
                        exc_info=True,
                    )
            # Managers: a guest paid online — the booking is now confirmed. Fire
            # only on the FIRST verification (skip PayMongo's duplicate webhooks).
            if reservation_id and processed == "payment_verified":
                try:
                    paid_reservation = get_reservation_by_id(reservation_id)
                    if paid_reservation:
                        notify_ops_payment_received(
                            reservation=paid_reservation,
                            amount=float(paid_reservation.get("amount_paid_verified") or 0),
                        )
                except Exception:  # noqa: BLE001 - notification is best-effort
                    logger.warning(
                        "ops payment-received notify failed (reservation_id=%s)",
                        reservation_id,
                        exc_info=True,
                    )
        elif event_type in {"payment.failed", "payment.rejected"} and payment_id:
            if current_status in {"verified", "rejected"}:
                processed = "ignored_terminal"
            else:
                reject_payment_service_role(payment_id, reason=reason)
                processed = "payment_rejected"
        elif event_type in {"refund.succeeded", "refund.completed"} and reservation_id:
            reservation_row = get_reservation_by_id(reservation_id) or {}
            update_reservation_policy_metadata(
                reservation_id=reservation_id,
                deposit_policy_version=str(reservation_row.get("deposit_policy_version") or "") or None,
                deposit_rule_applied=str(reservation_row.get("deposit_rule_applied") or "") or None,
                cancellation_actor=str(reservation_row.get("cancellation_actor") or "") or None,
                policy_outcome="refunded",
            )
            processed = "refund_recorded"
    except RuntimeError as exc:
        raise_http_from_runtime_error(exc, default_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    response_payload = {
        "processed": processed,
        "provider": provider,
        "event_id": event_id,
        "event_type": event_type,
        "payment_id": payment_id or None,
        "reservation_id": reservation_id or None,
        "reference_no": reference_no or None,
        "dedupe_result": "processed",
    }
    store_operation_receipt_safely(
        operation_id=operation_id,
        idempotency_key=event_id,
        user_id=WEBHOOK_SYSTEM_USER_ID,
        entity_type="payment_webhook",
        entity_id=payment_id or reservation_id or event_id,
        action=WEBHOOK_ROUTE_KEY,
        response_payload=response_payload,
        logger=logger,
        warning_label="Payment webhook",
    )
    return {"ok": True, **response_payload}
