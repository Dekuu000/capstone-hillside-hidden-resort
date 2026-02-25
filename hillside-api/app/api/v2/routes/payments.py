from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.auth import AuthContext, ensure_reservation_access, require_admin, require_authenticated
from app.integrations.supabase_client import (
    get_reservation_by_id,
    list_admin_payments,
    list_payments_by_reservation,
    record_on_site_payment as record_on_site_payment_rpc,
    reject_payment as reject_payment_rpc,
    submit_payment_proof as submit_payment_proof_rpc,
    update_payment_intent_amount as update_payment_intent_amount_rpc,
    verify_payment as verify_payment_rpc,
)
from app.schemas.common import (
    AdminPaymentsResponse,
    OnSitePaymentRequest,
    OnSitePaymentResponse,
    RejectPaymentResponse,
    VerifyPaymentResponse,
)

router = APIRouter()


def _http_status_from_runtime_error(exc: RuntimeError) -> int:
    message = str(exc).lower()
    if "not configured" in message:
        return status.HTTP_503_SERVICE_UNAVAILABLE
    if "proof of payment is required" in message:
        return status.HTTP_400_BAD_REQUEST
    return status.HTTP_400_BAD_REQUEST


class PaymentSubmissionRequest(BaseModel):
    reservation_id: str
    amount: float
    payment_type: str
    method: str
    reference_no: str | None = None
    proof_url: str | None = None
    idempotency_key: str


class PaymentSubmissionResponse(BaseModel):
    payment_id: str
    status: str
    reservation_status: str


class PaymentRejectRequest(BaseModel):
    reason: str


class PaymentIntentUpdateRequest(BaseModel):
    reservation_id: str
    amount: float


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
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

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
    _auth: AuthContext = Depends(require_admin),
):
    try:
        rows, total = list_admin_payments(
            tab=tab,
            limit=limit,
            offset=offset,
            search=search,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

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
    proof_url = (payload.proof_url or "").strip()
    if not proof_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="proof_url is required.",
        )

    try:
        reservation = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    ensure_reservation_access(auth, reservation)

    reservation_status = str(reservation.get("status") or "").lower()
    if reservation_status in {"cancelled", "no_show", "checked_out"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment submission is not allowed for this reservation status.",
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
        raise HTTPException(status_code=_http_status_from_runtime_error(exc), detail=str(exc)) from exc

    if isinstance(result, str):
        payment_id = result
    elif isinstance(result, list) and result:
        payment_id = str(result[0])
    else:
        payment_id = "submitted"
    return PaymentSubmissionResponse(
        payment_id=payment_id,
        status="pending",
        reservation_status="for_verification",
    )


@router.post("/intent")
def update_payment_intent(
    payload: PaymentIntentUpdateRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    try:
        reservation = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    ensure_reservation_access(auth, reservation)

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
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return {"ok": True}


@router.post("/on-site", response_model=OnSitePaymentResponse)
def record_on_site_payment(
    payload: OnSitePaymentRequest,
    auth: AuthContext = Depends(require_admin),
):
    if payload.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be greater than zero.",
        )

    try:
        reservation = get_reservation_by_id(payload.reservation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

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
        raise HTTPException(status_code=_http_status_from_runtime_error(exc), detail=str(exc)) from exc

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

    return {
        "ok": True,
        "payment_id": payment_id,
        "status": payment_status,
        "reservation_status": next_status,
    }


@router.post("/{payment_id}/verify", response_model=VerifyPaymentResponse)
def verify_payment(payment_id: str, auth: AuthContext = Depends(require_admin)):
    try:
        verify_payment_rpc(payment_id, access_token=auth.access_token, approved=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
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
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return {
        "ok": True,
        "payment_id": payment_id,
        "status": "rejected",
        "reason": reason,
    }
