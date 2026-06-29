import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from time import perf_counter

from supabase import Client, create_client

from app.core.config import settings
from app.core.status import canonical_booking_status, normalize_reservation_status_row
from app.observability.perf_metrics import perf_metrics


def _can_connect() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def _runtime_error_from_exception(exc: Exception) -> RuntimeError:
    message = getattr(exc, "message", None) or str(exc) or "Supabase request failed."
    details = getattr(exc, "details", None)
    hint = getattr(exc, "hint", None)
    parts = [str(message).strip()]
    if details:
        parts.append(f"Details: {details}")
    if hint:
        parts.append(f"Hint: {hint}")
    return RuntimeError(" ".join(part for part in parts if part))


def _timed_execute(metric_key: str, operation):
    start = perf_counter()
    try:
        return operation()
    finally:
        perf_metrics.record_db(metric_key, (perf_counter() - start) * 1000)


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    if not _can_connect():
        raise RuntimeError("Supabase integration not configured.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_supabase_user_scoped_client(access_token: str) -> Client:
    if not _can_connect():
        raise RuntimeError("Supabase integration not configured.")
    if not access_token:
        raise RuntimeError("Missing access token for user-scoped Supabase client.")
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    client.postgrest.auth(access_token)
    return client


RESERVATION_LIST_SELECT = """
    reservation_id,
    reservation_code,
    status,
    reservation_source,
    check_in_date,
    check_out_date,
    total_amount,
    original_total,
    discount_amount,
    promo_code,
    amount_paid_verified,
    balance_due,
    guest_count,
    created_at,
    notes,
    guest_user_id,
    guest:users!guest_user_id(name,email,phone,role)
"""

RESERVATION_DETAIL_SELECT = """
    *,
    guest:users!guest_user_id(name,email,phone,role),
    units:reservation_units(
        *,
        unit:units(*)
    ),
    service_bookings:service_bookings(
        *,
        service:services(*)
    )
"""

SERVICE_SELECT = """
    service_id,
    service_name,
    service_type,
    start_time,
    end_time,
    adult_rate,
    kid_rate,
    kid_age_rule,
    status,
    capacity_limit,
    description,
    image_urls,
    image_thumb_urls
"""

RESORT_SERVICE_SELECT = """
    service_item_id,
    category,
    service_name,
    description,
    price,
    eta_minutes,
    is_active,
    created_at,
    updated_at
"""

RESORT_SERVICE_REQUEST_SELECT = """
    request_id,
    guest_user_id,
    reservation_id,
    service_item_id,
    quantity,
    preferred_time,
    notes,
    status,
    unit_price,
    line_total,
    settled_at,
    waived,
    requested_at,
    processed_at,
    processed_by_user_id,
    updated_at,
    guest:users!guest_user_id(name,email,phone,role),
    reservation:reservations(reservation_code,status,total_amount,deposit_required,guest:users!guest_user_id(name,email)),
    service_item:resort_services(
        service_item_id,
        category,
        service_name,
        description,
        price,
        eta_minutes,
        is_active,
        created_at,
        updated_at
    )
"""

AI_FORECAST_SELECT = """
    forecast_id,
    forecast_type,
    start_date,
    horizon_days,
    model_version,
    source,
    inputs,
    series,
    created_by_user_id,
    generated_at,
    created_at
"""

AI_PRICING_SUGGESTION_SELECT = """
    suggestion_id,
    reservation_id,
    segment_key,
    check_in_date,
    check_out_date,
    visit_date,
    suggested_multiplier,
    demand_bucket,
    pricing_adjustment,
    confidence,
    model_version,
    source,
    features,
    explanations,
    signal_breakdown,
    confidence_breakdown,
    created_by_user_id,
    generated_at,
    created_at
"""

AI_CONCIERGE_SUGGESTION_SELECT = """
    suggestion_run_id,
    segment_key,
    stay_type,
    model_version,
    source,
    behavior,
    suggestions,
    notes,
    created_by_user_id,
    generated_at,
    created_at
"""

WELCOME_NOTIFICATION_SELECT = """
    notification_id,
    reservation_id,
    guest_user_id,
    event_type,
    title,
    message,
    suggestions,
    model_version,
    source,
    fallback_used,
    metadata,
    created_at,
    read_at
"""

PAYMENT_SELECT = """
    *,
    reservation:reservations!inner(
        reservation_code,
        status,
        reservation_source,
        total_amount,
        deposit_required,
        chain_key,
        chain_tx_hash,
        onchain_booking_id,
        deposit_policy_version,
        deposit_rule_applied,
        cancellation_actor,
        policy_outcome,
        guest:users!guest_user_id(name,email)
    )
"""

MY_BOOKING_LIST_SELECT = """
    reservation_id,
    reservation_code,
    status,
    created_at,
    check_in_date,
    check_out_date,
    total_amount,
    amount_paid_verified,
    deposit_required,
    expected_pay_now,
    escrow_state,
    guest_count,
    units:reservation_units(
        reservation_unit_id,
        quantity_or_nights,
        rate_snapshot,
        unit:units(name,unit_code,room_number,type,image_url,image_urls,image_thumb_urls)
    ),
    service_bookings:service_bookings(
        service_booking_id,
        visit_date,
        total_amount,
        adult_qty,
        kid_qty,
        service:services(service_name,image_urls,image_thumb_urls)
    )
"""

MY_RESERVATION_DETAIL_SELECT = """
    *,
    units:reservation_units(
        *,
        unit:units(*)
    ),
    service_bookings:service_bookings(
        *,
        service:services(*)
    ),
    payments:payments(*)
"""

ESCROW_RECONCILIATION_SELECT = """
    reservation_id,
    reservation_code,
    escrow_state,
    chain_key,
    chain_id,
    chain_tx_hash,
    onchain_booking_id,
    updated_at,
    created_at
"""

AUDIT_LOG_SELECT = """
    audit_id,
    performed_by_user_id,
    entity_type,
    entity_id,
    action,
    data_hash,
    metadata,
    blockchain_tx_hash,
    anchor_id,
    timestamp,
    performed_by:users!performed_by_user_id(name,email)
"""

UNIT_LIST_SELECT = """
    unit_id,
    name,
    unit_code,
    room_number,
    type,
    description,
    base_price,
    capacity,
    is_active,
    operational_status,
    image_url,
    image_urls,
    image_thumb_urls,
    amenities,
    created_at,
    updated_at
"""

# Reduced projection for the PUBLIC (unauthenticated) catalog. Excludes admin/ops
# fields (operational_status, room_number, is_active, timestamps) so anonymous
# browsers only see marketing-safe data.
UNIT_PUBLIC_SELECT = """
    unit_id,
    name,
    unit_code,
    type,
    description,
    base_price,
    capacity,
    image_url,
    image_urls,
    image_thumb_urls,
    amenities
"""

PAYMENT_TRANSACTION_SELECT = """
    payment_id,
    amount,
    status,
    method,
    payment_type,
    created_at,
    verified_at,
    reservation:reservations(reservation_code)
"""

SYNC_OPERATION_RECEIPT_SELECT = """
    operation_id,
    idempotency_key,
    user_id,
    entity_type,
    entity_id,
    action,
    status,
    http_status,
    conflict,
    server_version,
    resolution_hint,
    error_code,
    error_message,
    response_payload,
    metadata,
    created_at,
    updated_at
"""


def get_reservation_by_id(reservation_id: str) -> dict[str, Any] | None:
    client = get_supabase_client()
    response = (
        client.table("reservations")
        .select(
            """
            *,
            guest:users!guest_user_id(name,email,phone,role),
            units:reservation_units(
                *,
                unit:units(*)
            ),
            service_bookings:service_bookings(
                *,
                service:services(*)
            ),
            checkin_logs:checkin_logs(*)
            """
        )
        .eq("reservation_id", reservation_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return _normalize_reservation_row(rows[0]) if rows else None


def get_reservation_amounts(reservation_id: str) -> dict[str, Any] | None:
    """Lightweight amounts-only read (no joins) for echoing totals on the create
    response. Far cheaper than get_reservation_by_id's nested select — used right
    after the create RPC, which returns deposit fields but not the final total."""
    client = get_supabase_client()
    response = (
        client.table("reservations")
        .select("total_amount,amount_paid_verified,balance_due")
        .eq("reservation_id", reservation_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def get_reservation_folio(reservation_id: str) -> dict[str, Any] | None:
    """The guest folio for a reservation: the room balance plus any open add-on
    charges (fulfilled service requests that aren't settled or waived). The desk
    collects ``grand_total_due`` at check-out. Caller enforces auth/ownership."""
    try:
        client = get_supabase_client()
        res_rows = (
            client.table("reservations")
            .select("reservation_id,reservation_code,status,total_amount,amount_paid_verified")
            .eq("reservation_id", reservation_id)
            .limit(1)
            .execute()
        ).data or []
        if not res_rows:
            return None
        res = res_rows[0]
        room_total = float(res.get("total_amount") or 0)
        room_paid = float(res.get("amount_paid_verified") or 0)
        room_balance = max(0.0, room_total - room_paid)

        addon_rows = (
            client.table("resort_service_requests")
            .select("request_id,quantity,unit_price,line_total,service_item:resort_services(service_name)")
            .eq("reservation_id", reservation_id)
            .eq("status", "done")
            .eq("waived", False)
            .is_("settled_at", "null")
            .gt("line_total", 0)
            .order("requested_at", desc=False)
            .execute()
        ).data or []

        # Requests the guest raised that staff haven't fulfilled yet — not billable,
        # surfaced as a check-out warning so the desk can deliver/cancel first.
        pending_resp = (
            client.table("resort_service_requests")
            .select("request_id", count="exact")
            .eq("reservation_id", reservation_id)
            .in_("status", ["new", "in_progress"])
            .execute()
        )
        pending_request_count = int(pending_resp.count or 0)
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc
    addons = [
        {
            "request_id": str(row.get("request_id") or ""),
            "service_name": str((row.get("service_item") or {}).get("service_name") or "Service"),
            "quantity": int(row.get("quantity") or 1),
            "unit_price": float(row.get("unit_price") or 0),
            "line_total": float(row.get("line_total") or 0),
        }
        for row in addon_rows
    ]
    addons_subtotal = round(sum(a["line_total"] for a in addons), 2)
    return {
        "reservation_id": str(res.get("reservation_id") or ""),
        "reservation_code": str(res.get("reservation_code") or ""),
        "status": str(res.get("status") or ""),
        "room_total": round(room_total, 2),
        "room_paid": round(room_paid, 2),
        "room_balance": round(room_balance, 2),
        "addons": addons,
        "addons_subtotal": addons_subtotal,
        "grand_total_due": round(room_balance + addons_subtotal, 2),
        "pending_request_count": pending_request_count,
    }


def settle_reservation_folio(
    *,
    access_token: str,
    reservation_id: str,
    method: str,
) -> dict[str, Any] | None:
    """Collect the whole folio at the desk: record the room balance as an on-site
    payment (if any) and mark every open add-on charge settled with the same tender.
    Runs under the staff caller's auth (operations RLS / RPC role check). Returns the
    refreshed (now-zeroed) folio."""
    folio = get_reservation_folio(reservation_id)
    if not folio:
        return None
    room_balance = float(folio.get("room_balance") or 0)
    if room_balance > 0:
        record_on_site_payment(
            access_token=access_token,
            reservation_id=reservation_id,
            amount=room_balance,
            method=method,
            reference_no=None,
        )
    open_ids = [str(a.get("request_id")) for a in folio.get("addons", []) if a.get("request_id")]
    if open_ids:
        client = get_supabase_user_scoped_client(access_token)
        client.table("resort_service_requests").update(
            {
                "settled_at": datetime.now(timezone.utc).isoformat(),
                "settled_method": method,
            }
        ).in_("request_id", open_ids).execute()
    return get_reservation_folio(reservation_id)


def waive_service_charge(
    *,
    access_token: str,
    request_id: str,
    waived_by_user_id: str,
) -> dict[str, Any] | None:
    """Comp an add-on charge (staff). Removes it from the folio without collecting."""
    client = get_supabase_user_scoped_client(access_token)
    client.table("resort_service_requests").update(
        {
            "waived": True,
            "waived_by_user_id": waived_by_user_id,
            "waived_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("request_id", request_id).execute()
    rows = (
        client.table("resort_service_requests")
        .select(RESORT_SERVICE_REQUEST_SELECT)
        .eq("request_id", request_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def get_reservation_by_code(reservation_code: str) -> dict[str, Any] | None:
    client = get_supabase_client()
    response = (
        client.table("reservations")
        .select(RESERVATION_DETAIL_SELECT)
        .eq("reservation_code", reservation_code)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return _normalize_reservation_row(rows[0]) if rows else None


def _update_reservation_and_fetch(
    *,
    client: Client,
    reservation_id: str,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    client.table("reservations").update(payload).eq("reservation_id", reservation_id).execute()
    response = (
        client.table("reservations")
        .select(RESERVATION_DETAIL_SELECT)
        .eq("reservation_id", reservation_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return _normalize_reservation_row(rows[0]) if rows else None


def update_reservation_status(
    *,
    access_token: str,
    reservation_id: str,
    status: str,
    notes: str | None = None,
    include_notes: bool = False,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_user_scoped_client(access_token)
        payload: dict[str, Any] = {"status": status}
        if include_notes:
            payload["notes"] = notes
        return _update_reservation_and_fetch(
            client=client,
            reservation_id=reservation_id,
            payload=payload,
        )
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_reservation_source(
    *,
    reservation_id: str,
    reservation_source: str,
) -> dict[str, Any] | None:
    if reservation_source not in {"online", "walk_in"}:
        raise RuntimeError("Invalid reservation source.")
    try:
        client = get_supabase_client()
        return _update_reservation_and_fetch(
            client=client,
            reservation_id=reservation_id,
            payload={"reservation_source": reservation_source},
        )
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_reservation_policy_metadata(
    *,
    reservation_id: str,
    deposit_policy_version: str | None = None,
    deposit_rule_applied: str | None = None,
    cancellation_actor: str | None = None,
    policy_outcome: str | None = None,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        return _update_reservation_and_fetch(
            client=client,
            reservation_id=reservation_id,
            payload={
                "deposit_policy_version": deposit_policy_version,
                "deposit_rule_applied": deposit_rule_applied,
                "cancellation_actor": cancellation_actor,
                "policy_outcome": policy_outcome,
            },
        )
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def _normalize_sort_column(sort_by: str | None) -> str:
    allowed = {"created_at", "check_in_date", "check_out_date", "reservation_code", "total_amount"}
    if sort_by in allowed:
        return sort_by
    return "created_at"


def _apply_reservation_filters(
    query,
    status_filter: str | None,
    source_filter: str | None = None,
):
    if status_filter:
        query = query.eq("status", status_filter)
    if source_filter in {"online", "walk_in"}:
        query = query.eq("reservation_source", source_filter)
    return query


def _infer_payment_source(row: dict[str, Any]) -> str:
    reservation = row.get("reservation") or {}
    explicit = str((reservation.get("reservation_source") or "")).lower()
    if explicit in {"online", "walk_in"}:
        return explicit
    return "walk_in" if str(row.get("payment_type") or "").lower() == "on_site" else "online"


def _matches_search(row: dict[str, Any], search_term: str) -> bool:
    guest = row.get("guest") or {}
    haystacks = [
        str(row.get("reservation_code") or "").lower(),
        str(guest.get("name") or "").lower(),
        str(guest.get("email") or "").lower(),
        str(guest.get("phone") or "").lower(),
        str(row.get("notes") or "").lower(),
    ]
    return any(search_term in value for value in haystacks)


def _matches_payment_search(row: dict[str, Any], search_term: str) -> bool:
    reservation = row.get("reservation") or {}
    guest = reservation.get("guest") or {}
    haystacks = [
        str(reservation.get("reservation_code") or "").lower(),
        str(guest.get("name") or "").lower(),
        str(guest.get("email") or "").lower(),
        str(row.get("reference_no") or "").lower(),
    ]
    return any(search_term in value for value in haystacks)


def _normalize_service_bookings(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    service_bookings = normalized.get("service_bookings")
    if not isinstance(service_bookings, list):
        return normalized

    fallback_total = float(normalized.get("total_amount") or 0)
    normalized_bookings: list[dict[str, Any]] = []
    for booking in service_bookings:
        if not isinstance(booking, dict):
            continue
        next_booking = dict(booking)
        next_booking.setdefault("total_amount", fallback_total)
        next_booking.setdefault("adult_qty", None)
        next_booking.setdefault("kid_qty", None)
        next_booking.setdefault("visit_date", normalized.get("check_in_date"))
        normalized_bookings.append(next_booking)

    normalized["service_bookings"] = normalized_bookings
    return normalized


def _normalize_reservation_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_reservation_status_row(row)
    return _normalize_service_bookings(normalized)


def _parse_utc_datetime(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def release_expired_pending_payment_holds(*, older_than_utc: datetime, limit: int = 200) -> int:
    """
    Auto-release stale pending-payment holds so units return to inventory.
    """
    try:
        client = get_supabase_client()
        cutoff = older_than_utc.astimezone(timezone.utc).isoformat()
        response = (
            client.table("reservations")
            .select("reservation_id,created_at,amount_paid_verified,status")
            .eq("status", "pending_payment")
            .lt("created_at", cutoff)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        candidates = response.data or []
        if not candidates:
            return 0

        released = 0
        for row in candidates:
            amount_paid = float(row.get("amount_paid_verified") or 0)
            if amount_paid > 0:
                continue
            reservation_id = str(row.get("reservation_id") or "")
            if not reservation_id:
                continue
            client.table("reservations").update(
                {
                    "status": "cancelled",
                    "policy_outcome": "forfeited",
                    "cancellation_actor": "guest",
                }
            ).eq("reservation_id", reservation_id).eq("status", "pending_payment").execute()
            released += 1
        return released
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def expire_pending_payment_hold_for_reservation(
    *,
    reservation_id: str,
    older_than_utc: datetime,
) -> bool:
    """
    Expire one pending-payment reservation hold when its payment window elapsed.
    Returns True when reservation was transitioned to cancelled.
    """
    try:
        client = get_supabase_client()
        response = (
            client.table("reservations")
            .select("reservation_id,created_at,status,amount_paid_verified")
            .eq("reservation_id", reservation_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return False
        row = rows[0]
        if str(row.get("status") or "").lower() != "pending_payment":
            return False
        amount_paid = float(row.get("amount_paid_verified") or 0)
        if amount_paid > 0:
            return False
        created_at = _parse_utc_datetime(row.get("created_at"))
        if created_at is None or created_at >= older_than_utc.astimezone(timezone.utc):
            return False

        client.table("reservations").update(
            {
                "status": "cancelled",
                "policy_outcome": "forfeited",
                "cancellation_actor": "guest",
            }
        ).eq("reservation_id", reservation_id).eq("status", "pending_payment").execute()
        return True
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def _attach_admin_users(payments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    admin_ids = sorted(
        {
            value
            for row in payments
            for value in (row.get("verified_by_admin_id"), row.get("rejected_by_admin_id"))
            if value
        }
    )
    if not admin_ids:
        return payments

    client = get_supabase_client()
    admin_response = (
        client.table("users")
        .select("user_id,name,email")
        .in_("user_id", admin_ids)
        .execute()
    )
    admin_rows = admin_response.data or []
    admin_map = {row["user_id"]: row for row in admin_rows if row.get("user_id")}

    enriched: list[dict[str, Any]] = []
    for row in payments:
        next_row = dict(row)
        verified_id = row.get("verified_by_admin_id")
        rejected_id = row.get("rejected_by_admin_id")
        next_row["verified_admin"] = admin_map.get(verified_id) if verified_id else None
        next_row["rejected_admin"] = admin_map.get(rejected_id) if rejected_id else None
        enriched.append(next_row)
    return enriched


def _attach_latest_webhook_audit(payments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payment_ids = sorted({str(row.get("payment_id") or "").strip() for row in payments if row.get("payment_id")})
    if not payment_ids:
        return payments

    try:
        client = get_supabase_client()
        response = (
            client.table("sync_operation_receipts")
            .select("entity_id,status,response_payload,created_at")
            .eq("entity_type", "payment_webhook")
            .eq("action", "payments.webhooks.provider")
            .in_("entity_id", payment_ids)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        receipt_rows = response.data or []
    except Exception:
        return payments

    latest_by_payment: dict[str, dict[str, Any]] = {}
    for receipt in receipt_rows:
        payment_id = str(receipt.get("entity_id") or "").strip()
        if not payment_id or payment_id in latest_by_payment:
            continue
        payload = receipt.get("response_payload") if isinstance(receipt.get("response_payload"), dict) else {}
        latest_by_payment[payment_id] = {
            "event_type": str(payload.get("event_type") or "").strip().lower() or None,
            "dedupe_result": "deduped" if bool(payload.get("deduped")) else "processed",
            "provider": str(payload.get("provider") or "").strip().lower() or None,
            "provider_event_id": str(payload.get("event_id") or "").strip() or None,
            "linked_payment_id": str(payload.get("payment_id") or "").strip() or None,
            "linked_reservation_id": str(payload.get("reservation_id") or "").strip() or None,
            "processed": str(payload.get("processed") or "").strip().lower() or None,
            "received_at": receipt.get("created_at"),
        }

    enriched: list[dict[str, Any]] = []
    for row in payments:
        next_row = dict(row)
        payment_id = str(row.get("payment_id") or "").strip()
        if payment_id and payment_id in latest_by_payment:
            audit = dict(latest_by_payment[payment_id])
            reservation = row.get("reservation") or {}
            chain_tx_hash = str(reservation.get("chain_tx_hash") or "").strip()
            chain_key = str(reservation.get("chain_key") or "").strip()
            onchain_booking_id = str(reservation.get("onchain_booking_id") or "").strip()
            audit["chain_proof_reference"] = chain_tx_hash or None
            audit["chain_key"] = chain_key or None
            audit["onchain_booking_id"] = onchain_booking_id or None
            next_row["webhook_audit"] = audit
        else:
            next_row["webhook_audit"] = None
        enriched.append(next_row)
    return enriched


def _attach_open_charges_totals(rows: list[dict[str, Any]]) -> None:
    """Stamp each reservation row with ``open_charges_total`` — the sum of its
    fulfilled (status='done'), unsettled, un-waived add-on charges. One batched
    query for the whole page so the list stays cheap. Best-effort: on any error
    every row simply keeps a 0 total."""
    ids = [str(r.get("reservation_id")) for r in rows if r.get("reservation_id")]
    for row in rows:
        row.setdefault("open_charges_total", 0.0)
    if not ids:
        return
    try:
        client = get_supabase_client()
        resp = (
            client.table("resort_service_requests")
            .select("reservation_id,line_total")
            .in_("reservation_id", ids)
            .eq("status", "done")
            .eq("waived", False)
            .is_("settled_at", "null")
            .gt("line_total", 0)
            .execute()
        )
        totals: dict[str, float] = {}
        for charge in resp.data or []:
            rid = str(charge.get("reservation_id") or "")
            totals[rid] = totals.get(rid, 0.0) + float(charge.get("line_total") or 0)
        for row in rows:
            rid = str(row.get("reservation_id") or "")
            row["open_charges_total"] = round(totals.get(rid, 0.0), 2)
    except Exception:  # noqa: BLE001 - best-effort enrichment, never break the list
        import logging

        logging.getLogger(__name__).debug(
            "Failed to attach open-charge totals to reservation list", exc_info=True
        )


def list_recent_reservations(
    *,
    limit: int = 10,
    offset: int = 0,
    status_filter: str | None = None,
    source_filter: str | None = None,
    search: str | None = None,
    sort_by: str | None = None,
    sort_dir: str = "desc",
) -> tuple[list[dict[str, Any]], int]:
    client = get_supabase_client()
    sort_column = _normalize_sort_column(sort_by)
    descending = str(sort_dir).lower() != "asc"
    search_term = (search or "").strip().lower()
    base_query = (
        client.table("reservations")
        .select(RESERVATION_LIST_SELECT, count="exact")
        .order(sort_column, desc=descending)
        .order("reservation_id", desc=descending)
    )
    base_query = _apply_reservation_filters(base_query, status_filter, source_filter)

    if not search_term:
        response = _timed_execute(
            "db.reservations.list_recent.page",
            lambda: base_query.range(offset, offset + limit - 1).execute(),
        )
        rows = [_normalize_reservation_row(row) for row in (response.data or [])]
        _attach_open_charges_totals(rows)
        return rows, int(response.count or 0)

    full_response = _timed_execute(
        "db.reservations.list_recent.search_scan",
        lambda: base_query.range(0, 999).execute(),
    )
    rows = full_response.data or []
    filtered_rows = [_normalize_reservation_row(row) for row in rows if _matches_search(row, search_term)]
    page = filtered_rows[offset : offset + limit]
    _attach_open_charges_totals(page)
    return page, len(filtered_rows)


def get_reservation_quick_stats(*, today: str) -> dict[str, int]:
    """
    Server-side aggregate for the admin Reservations quick-stats tiles.

    Uses cheap ``count="exact"`` queries instead of shipping every reservation
    row to the browser to be counted client-side. The four counts mirror the
    derivations in the frontend (lib/reservationView + AdminReservationsClient):

    - today_arrivals     : reservations arriving today that are still live
                           (excludes cancelled / no_show / checked_out — those
                           aren't real arrivals)
    - pending_payment    : active reservations still owing money (status
                           pending_payment/for_verification OR any balance_due);
                           surfaced in the UI as the "Awaiting payment" tile
    - walk_ins_today     : walk-in source arriving today OR created today
    - ready_for_check_in : today's confirmed arrivals (deposit paid) yet to check in
    """
    client = get_supabase_client()

    try:
        tomorrow = (date.fromisoformat(today) + timedelta(days=1)).isoformat()
    except ValueError as exc:
        raise _runtime_error_from_exception(exc) from exc

    excluded_statuses = ["cancelled", "checked_out", "no_show"]

    def _count(label: str, build) -> int:
        response = _timed_execute(label, lambda: build().limit(1).execute())
        return int(response.count or 0)

    try:
        today_arrivals = _count(
            "db.reservations.stats.today_arrivals",
            lambda: client.table("reservations")
            .select("reservation_id", count="exact")
            .eq("check_in_date", today)
            .not_.in_("status", excluded_statuses),
        )
        pending_payment = _count(
            "db.reservations.stats.pending_payment",
            lambda: client.table("reservations")
            .select("reservation_id", count="exact")
            .not_.in_("status", excluded_statuses)
            .or_("status.in.(pending_payment,for_verification),balance_due.gt.0"),
        )
        walk_ins_today = _count(
            "db.reservations.stats.walk_ins_today",
            lambda: client.table("reservations")
            .select("reservation_id", count="exact")
            .eq("reservation_source", "walk_in")
            .or_(f"check_in_date.eq.{today},and(created_at.gte.{today},created_at.lt.{tomorrow})"),
        )
        ready_for_check_in = _count(
            "db.reservations.stats.ready_for_check_in",
            # "confirmed" means the deposit was verified; the balance is collected
            # at the desk during check-in, so a remaining balance_due must NOT
            # exclude a guest here. This is the live count of today's arrivals
            # still to be checked in (drops off as staff process each one).
            lambda: client.table("reservations")
            .select("reservation_id", count="exact")
            .eq("check_in_date", today)
            .eq("status", "confirmed")
            .gt("total_amount", 0),
        )
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc

    return {
        "today_arrivals": today_arrivals,
        "pending_payment": pending_payment,
        "walk_ins_today": walk_ins_today,
        "ready_for_check_in": ready_for_check_in,
    }


def list_reservations_for_escrow_reconciliation(
    *,
    chain_key: str,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    try:
        client = get_supabase_client()
        query = (
            client.table("reservations")
            .select(ESCROW_RECONCILIATION_SELECT, count="exact")
            .eq("chain_key", chain_key)
            .in_("escrow_state", ["pending_lock", "locked", "pending_release", "released", "refunded", "failed"])
            .order("created_at", desc=True)
        )
        response = _timed_execute(
            "db.escrow.reconciliation.page",
            lambda: query.range(offset, offset + limit - 1).execute(),
        )
        return response.data or [], int(response.count or 0)
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_escrow_contract_status_rows(
    *,
    chain_key: str,
    from_ts: str,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int, int]:
    try:
        client = get_supabase_client()

        successful_states = ["locked", "released", "refunded"]
        successful_query = (
            client.table("reservations")
            .select(
                "reservation_id,reservation_code,escrow_state,chain_tx_hash,onchain_booking_id,updated_at,created_at",
                count="exact",
            )
            .eq("chain_key", chain_key)
            .in_("escrow_state", successful_states)
            .not_.is_("chain_tx_hash", None)
            .gte("updated_at", from_ts)
            .order("updated_at", desc=True)
        )

        successful_response = _timed_execute(
            "db.escrow.contract_status.successful",
            lambda: successful_query.range(offset, offset + limit - 1).execute(),
        )
        successful_rows = successful_response.data or []
        successful_total = int(successful_response.count or 0)

        pending_query = (
            client.table("reservations")
            .select("reservation_id", count="exact")
            .eq("chain_key", chain_key)
            .in_("escrow_state", ["pending_lock", "pending_release"])
            .limit(1)
        )
        pending_response = _timed_execute(
            "db.escrow.contract_status.pending",
            lambda: pending_query.execute(),
        )
        pending_count = int(pending_response.count or 0)

        return successful_rows, successful_total, pending_count
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_reservations_for_shadow_cleanup(
    *,
    chain_key: str,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Return likely stale shadow rows produced during early shadow-write rollout.
    We intentionally keep this strict: pending_lock + tx hash prefixed with shadow-.
    """
    try:
        client = get_supabase_client()
        response = (
            client.table("reservations")
            .select(
                """
                reservation_id,
                reservation_code,
                escrow_state,
                chain_key,
                chain_tx_hash,
                onchain_booking_id,
                created_at
                """
            )
            .eq("chain_key", chain_key)
            .eq("escrow_state", "pending_lock")
            .like("chain_tx_hash", "shadow-%")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def clear_reservation_shadow_escrow_metadata(
    *,
    reservation_id: str,
    chain_key: str,
    expected_tx_hash: str,
) -> bool:
    """
    Clear stale shadow metadata using strict match guards to avoid touching
    legitimate on-chain rows.
    """
    try:
        client = get_supabase_client()
        client.table("reservations").update(
            {
                "escrow_state": "none",
                "chain_key": None,
                "chain_id": None,
                "escrow_contract_address": None,
                "chain_tx_hash": None,
                "onchain_booking_id": None,
                "escrow_event_index": None,
            }
        ).eq("reservation_id", reservation_id).eq("chain_key", chain_key).eq("escrow_state", "pending_lock").eq(
            "chain_tx_hash", expected_tx_hash
        ).execute()

        verify = (
            client.table("reservations")
            .select("escrow_state,chain_key,chain_tx_hash,onchain_booking_id")
            .eq("reservation_id", reservation_id)
            .limit(1)
            .execute()
        )
        row = (verify.data or [None])[0]
        if not isinstance(row, dict):
            return False
        return (
            str(row.get("escrow_state") or "").lower() == "none"
            and row.get("chain_key") is None
            and row.get("chain_tx_hash") is None
            and row.get("onchain_booking_id") is None
        )
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_guest_reservation_ids(*, user_id: str) -> set[str]:
    try:
        client = get_supabase_client()
        response = (
            client.table("reservations")
            .select("reservation_id")
            .eq("guest_user_id", user_id)
            .limit(2000)
            .execute()
        )
        rows = response.data or []
        return {str(row.get("reservation_id")) for row in rows if row.get("reservation_id")}
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_sync_change_events(
    *,
    cursor: int = 0,
    limit: int = 200,
) -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        query = (
            client.table("sync_change_events")
            .select("event_id,entity_type,entity_id,action,version,changed_at,payload")
            .gt("event_id", cursor)
            .order("event_id", desc=False)
            .limit(limit)
        )
        response = _timed_execute(
            "db.sync.pull.events",
            lambda: query.execute(),
        )
        rows = response.data or []
        normalized: list[dict[str, Any]] = []
        for row in rows:
            normalized.append(
                {
                    "cursor": int(row.get("event_id") or 0),
                    "entity_type": str(row.get("entity_type") or ""),
                    "entity_id": str(row.get("entity_id") or ""),
                    "action": str(row.get("action") or "update"),
                    "version": int(row.get("version") or 0),
                    "changed_at": row.get("changed_at"),
                    "payload": row.get("payload") if isinstance(row.get("payload"), dict) else {},
                }
            )
        return normalized
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_sync_operation_receipt(
    *,
    operation_id: str,
    user_id: str,
    idempotency_key: str | None = None,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        query = (
            client.table("sync_operation_receipts")
            .select(SYNC_OPERATION_RECEIPT_SELECT)
            .eq("user_id", user_id)
            .eq("operation_id", operation_id)
            .limit(1)
        )
        response = query.execute()
        rows = response.data or []
        if rows:
            return rows[0]

        if idempotency_key:
            alt_response = (
                client.table("sync_operation_receipts")
                .select(SYNC_OPERATION_RECEIPT_SELECT)
                .eq("user_id", user_id)
                .eq("idempotency_key", idempotency_key)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            alt_rows = alt_response.data or []
            return alt_rows[0] if alt_rows else None
        return None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def upsert_sync_operation_receipt(
    *,
    operation_id: str,
    idempotency_key: str,
    user_id: str,
    entity_type: str,
    entity_id: str | None,
    action: str,
    status: str,
    http_status: int,
    conflict: bool = False,
    server_version: int | None = None,
    resolution_hint: str | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    response_payload: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        payload: dict[str, Any] = {
            "operation_id": operation_id,
            "idempotency_key": idempotency_key,
            "user_id": user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "status": status,
            "http_status": http_status,
            "conflict": conflict,
            "server_version": server_version,
            "resolution_hint": resolution_hint,
            "error_code": error_code,
            "error_message": error_message,
            "response_payload": response_payload or {},
            "metadata": metadata or {},
        }
        client.table("sync_operation_receipts").upsert(payload).execute()
        verify = (
            client.table("sync_operation_receipts")
            .select(SYNC_OPERATION_RECEIPT_SELECT)
            .eq("operation_id", operation_id)
            .limit(1)
            .execute()
        )
        rows = verify.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def cleanup_sync_operation_receipts(*, retention_hours: int) -> int:
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, retention_hours))
        client = get_supabase_client()
        response = (
            client.table("sync_operation_receipts")
            .delete(count="exact")
            .lt("created_at", cutoff.isoformat())
            .execute()
        )
        return int(response.count or 0)
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def upsert_sync_upload_item(
    *,
    upload_id: str,
    operation_id: str,
    user_id: str,
    entity_type: str,
    entity_id: str,
    field_name: str,
    storage_bucket: str,
    storage_path: str,
    mime_type: str | None = None,
    size_bytes: int | None = None,
    checksum_sha256: str | None = None,
    status: str = "queued",
    failure_reason: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        payload = {
            "upload_id": upload_id,
            "operation_id": operation_id,
            "user_id": user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "field_name": field_name,
            "storage_bucket": storage_bucket,
            "storage_path": storage_path,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "checksum_sha256": checksum_sha256,
            "status": status,
            "failure_reason": failure_reason,
            "metadata": metadata or {},
        }
        client.table("sync_upload_items").upsert(payload).execute()
        verify = (
            client.table("sync_upload_items")
            .select("*")
            .eq("upload_id", upload_id)
            .limit(1)
            .execute()
        )
        rows = verify.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_my_reservations(
    *,
    user_id: str,
    limit: int = 50,
    offset: int = 0,
    status_filter: str | None = None,
    search: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    client = get_supabase_client()
    query = (
        client.table("reservations")
        .select(MY_BOOKING_LIST_SELECT, count="exact")
        .eq("guest_user_id", user_id)
        .order("created_at", desc=True)
    )
    if status_filter:
        query = query.eq("status", status_filter)

    search_term = (search or "").strip().lower()
    if not search_term:
        response = query.range(offset, offset + limit - 1).execute()
        rows = [_normalize_reservation_row(row) for row in (response.data or [])]
        return rows, int(response.count or 0)

    response = _timed_execute(
        "db.payments.list_admin.scan",
        lambda: query.range(0, 999).execute(),
    )
    rows = response.data or []
    filtered_rows = [
        row
        for row in rows
        if search_term in str(row.get("reservation_code") or "").lower()
    ]
    normalized_rows = [_normalize_reservation_row(row) for row in filtered_rows]
    return normalized_rows[offset : offset + limit], len(normalized_rows)


def _matches_my_bookings_tab(row: dict[str, Any], *, tab: str, today_iso: str) -> bool:
    status = canonical_booking_status(row.get("status"))
    check_out_date = row.get("check_out_date")

    if tab == "upcoming":
        return status in {"confirmed", "for_verification"} and (
            check_out_date is None or str(check_out_date) >= today_iso
        )
    if tab == "pending_payment":
        return status == "pending_payment"
    if tab == "completed":
        return status == "checked_out"
    return status in {"cancelled", "no_show"}


def _apply_my_bookings_tab_query(query, *, tab: str, today_iso: str):
    if tab == "upcoming":
        return query.in_("status", ["confirmed", "for_verification"]).gte("check_out_date", today_iso)
    if tab == "pending_payment":
        return query.eq("status", "pending_payment")
    if tab == "completed":
        return query.eq("status", "checked_out")
    return query.in_("status", ["cancelled", "no_show"])


def _sort_my_bookings(rows: list[dict[str, Any]], *, tab: str) -> list[dict[str, Any]]:
    if tab == "upcoming":
        return sorted(
            rows,
            key=lambda row: (
                str(row.get("check_in_date") or ""),
                str(row.get("created_at") or ""),
                str(row.get("reservation_id") or ""),
            ),
        )

    return sorted(
        rows,
        key=lambda row: (
            str(row.get("created_at") or ""),
            str(row.get("reservation_id") or ""),
        ),
        reverse=True,
    )


def _apply_my_bookings_cursor(
    rows: list[dict[str, Any]],
    *,
    tab: str,
    cursor: dict[str, str] | None,
) -> list[dict[str, Any]]:
    if not cursor:
        return rows

    created_at = cursor.get("created_at")
    reservation_id = cursor.get("reservation_id")
    check_in_date = cursor.get("check_in_date")

    if not created_at or not reservation_id:
        return rows

    if tab == "upcoming":
        if not check_in_date:
            return rows
        return [
            row
            for row in rows
            if (
                str(row.get("check_in_date") or "") > check_in_date
                or (
                    str(row.get("check_in_date") or "") == check_in_date
                    and str(row.get("created_at") or "") > created_at
                )
                or (
                    str(row.get("check_in_date") or "") == check_in_date
                    and str(row.get("created_at") or "") == created_at
                    and str(row.get("reservation_id") or "") > reservation_id
                )
            )
        ]

    return [
        row
        for row in rows
        if (
            str(row.get("created_at") or "") < created_at
            or (
                str(row.get("created_at") or "") == created_at
                and str(row.get("reservation_id") or "") < reservation_id
            )
        )
    ]


def _matches_my_booking_search(row: dict[str, Any], search_term: str) -> bool:
    normalized = search_term.strip().lower()
    if not normalized:
        return True

    code = str(row.get("reservation_code") or "").lower()
    if normalized in code:
        return True

    units = row.get("units") or []
    for unit_row in units:
        unit = unit_row.get("unit") or {}
        unit_name = str(unit.get("name") or "").lower()
        if normalized in unit_name:
            return True

    service_bookings = row.get("service_bookings") or []
    for booking_row in service_bookings:
        service = booking_row.get("service") or {}
        service_name = str(service.get("service_name") or "").lower()
        if normalized in service_name:
            return True

    return False


def list_my_bookings(
    *,
    user_id: str,
    tab: str,
    limit: int = 10,
    cursor: dict[str, str] | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    client = get_supabase_client()
    today_iso = date.today().isoformat()
    search_term = (search or "").strip().lower()

    # Fast path: first page without search uses DB-side filtering/sorting + limit.
    # If DB-side enum/status filtering errors (legacy drift), we fallback to compatibility path below.
    if not search_term and not cursor:
        try:
            query = (
                client.table("reservations")
                .select(MY_BOOKING_LIST_SELECT, count="exact")
                .eq("guest_user_id", user_id)
            )
            query = _apply_my_bookings_tab_query(query, tab=tab, today_iso=today_iso)

            if tab == "upcoming":
                query = (
                    query.order("check_in_date", desc=False)
                    .order("created_at", desc=False)
                    .order("reservation_id", desc=False)
                )
            else:
                query = query.order("created_at", desc=True).order("reservation_id", desc=True)

            response = query.range(0, limit).execute()
            rows = [_normalize_reservation_row(row) for row in (response.data or [])]
            has_more = len(rows) > limit
            page_items = rows[:limit]
            last = page_items[-1] if page_items else None

            next_cursor = None
            if has_more and last:
                next_cursor = {
                    "checkInDate": str(last.get("check_in_date")) if tab == "upcoming" else None,
                    "createdAt": str(last.get("created_at") or ""),
                    "reservationId": str(last.get("reservation_id") or ""),
                }

            return {
                "items": page_items,
                "nextCursor": next_cursor,
                "totalCount": int(response.count or 0),
            }
        except Exception:
            # Fall through to full compatibility path below.
            pass

    # Compatibility path for cursor + flexible search on nested unit/service names.
    response = (
        client.table("reservations")
        .select(MY_BOOKING_LIST_SELECT)
        .eq("guest_user_id", user_id)
        .execute()
    )
    rows = [_normalize_reservation_row(row) for row in (response.data or [])]
    filtered = [row for row in rows if _matches_my_bookings_tab(row, tab=tab, today_iso=today_iso)]

    if search_term:
        filtered = [row for row in filtered if _matches_my_booking_search(row, search_term)]

    sorted_rows = _sort_my_bookings(filtered, tab=tab)
    after_cursor = _apply_my_bookings_cursor(sorted_rows, tab=tab, cursor=cursor)

    has_more = len(after_cursor) > limit
    page_items = after_cursor[:limit]
    last = page_items[-1] if page_items else None

    next_cursor = None
    if has_more and last:
        next_cursor = {
            "checkInDate": str(last.get("check_in_date")) if tab == "upcoming" else None,
            "createdAt": str(last.get("created_at") or ""),
            "reservationId": str(last.get("reservation_id") or ""),
        }

    return {
        "items": page_items,
        "nextCursor": next_cursor,
        "totalCount": len(filtered),
    }


def get_my_booking_details(*, user_id: str, reservation_id: str) -> dict[str, Any] | None:
    client = get_supabase_client()
    response = (
        client.table("reservations")
        .select(MY_RESERVATION_DETAIL_SELECT)
        .eq("guest_user_id", user_id)
        .eq("reservation_id", reservation_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return _normalize_reservation_row(rows[0]) if rows else None


def get_my_active_or_upcoming_stay(*, user_id: str) -> dict[str, Any] | None:
    client = get_supabase_client()
    today_iso = date.today().isoformat()

    checked_in_response = (
        client.table("reservations")
        .select(MY_BOOKING_LIST_SELECT)
        .eq("guest_user_id", user_id)
        .eq("status", "checked_in")
        .order("check_in_date", desc=True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    checked_in_rows = checked_in_response.data or []
    if checked_in_rows:
        return _normalize_reservation_row(checked_in_rows[0])

    upcoming_response = (
        client.table("reservations")
        .select(MY_BOOKING_LIST_SELECT)
        .eq("guest_user_id", user_id)
        .in_("status", ["confirmed", "for_verification"])
        .gte("check_out_date", today_iso)
        .order("check_in_date", desc=False)
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    upcoming_rows = upcoming_response.data or []
    if upcoming_rows:
        return _normalize_reservation_row(upcoming_rows[0])
    return None


def get_latest_guest_welcome_notification(
    *,
    guest_user_id: str,
    reservation_id: str,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        response = (
            client.table("guest_welcome_notifications")
            .select(WELCOME_NOTIFICATION_SELECT)
            .eq("guest_user_id", guest_user_id)
            .eq("reservation_id", reservation_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def mark_guest_welcome_notification_read(
    *,
    guest_user_id: str,
    notification_id: str,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        client.table("guest_welcome_notifications").update(
            {"read_at": now_iso}
        ).eq("notification_id", notification_id).eq("guest_user_id", guest_user_id).execute()
        response = (
            client.table("guest_welcome_notifications")
            .select(WELCOME_NOTIFICATION_SELECT)
            .eq("notification_id", notification_id)
            .eq("guest_user_id", guest_user_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def create_or_get_guest_welcome_notification(
    *,
    reservation_id: str,
    guest_user_id: str,
    title: str,
    message: str,
    suggestions: list[dict[str, Any]],
    model_version: str | None,
    source: str,
    fallback_used: bool,
    metadata: dict[str, Any] | None = None,
    event_type: str = "checkin_welcome",
) -> tuple[dict[str, Any] | None, bool]:
    try:
        client = get_supabase_client()
        existing = (
            client.table("guest_welcome_notifications")
            .select(WELCOME_NOTIFICATION_SELECT)
            .eq("reservation_id", reservation_id)
            .eq("event_type", event_type)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        existing_rows = existing.data or []
        if existing_rows:
            return existing_rows[0], False

        payload = {
            "reservation_id": reservation_id,
            "guest_user_id": guest_user_id,
            "event_type": event_type,
            "title": title,
            "message": message,
            "suggestions": suggestions,
            "model_version": model_version,
            "source": source,
            "fallback_used": bool(fallback_used),
            "metadata": metadata or {},
        }
        created = client.table("guest_welcome_notifications").insert(payload).execute()
        rows = created.data or []
        if rows:
            return rows[0], True

        verify = (
            client.table("guest_welcome_notifications")
            .select(WELCOME_NOTIFICATION_SELECT)
            .eq("reservation_id", reservation_id)
            .eq("event_type", event_type)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        verify_rows = verify.data or []
        return (verify_rows[0] if verify_rows else None), bool(verify_rows)
    except Exception as exc:  # noqa: BLE001
        message = str(getattr(exc, "message", "") or exc)
        if "duplicate key" in message.lower() or "uq_guest_welcome_notifications_reservation_event" in message:
            try:
                client = get_supabase_client()
                response = (
                    client.table("guest_welcome_notifications")
                    .select(WELCOME_NOTIFICATION_SELECT)
                    .eq("reservation_id", reservation_id)
                    .eq("event_type", event_type)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                rows = response.data or []
                return (rows[0] if rows else None), False
            except Exception as nested_exc:  # noqa: BLE001
                raise _runtime_error_from_exception(nested_exc) from nested_exc
        raise _runtime_error_from_exception(exc) from exc


def list_pending_release_reservations(
    *,
    chain_key: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        response = (
            client.table("reservations")
            .select(
                "reservation_id,reservation_code,guest_user_id,status,escrow_state,"
                "chain_key,chain_id,escrow_contract_address,chain_tx_hash,onchain_booking_id,"
                "escrow_event_index,escrow_release_attempts,escrow_release_last_attempt_at,escrow_release_last_error"
            )
            .eq("chain_key", chain_key)
            .eq("escrow_state", "pending_release")
            .order("escrow_release_last_attempt_at", desc=False)
            .order("updated_at", desc=False)
            .limit(limit)
            .execute()
        )
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_admin_payments(
    *,
    tab: str = "to_review",
    limit: int = 10,
    offset: int = 0,
    search: str | None = None,
    method_filter: str | None = None,
    from_ts: str | None = None,
    to_ts: str | None = None,
    source_filter: str | None = None,
    settlement_filter: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    client = get_supabase_client()
    normalized_source = source_filter if source_filter in {"online", "walk_in"} else None
    normalized_settlement = settlement_filter if settlement_filter in {"paid", "partial"} else None
    search_term = (search or "").strip().lower()

    def _run(select_clause: str) -> tuple[list[dict[str, Any]], int]:
        query = (
            client.table("payments")
            .select(select_clause, count="exact")
            .order("created_at", desc=True)
        )

        if tab == "to_review":
            query = query.eq("status", "pending")
        elif tab == "verified":
            query = query.eq("status", "verified")
        elif tab == "rejected":
            query = query.eq("status", "rejected")

        if method_filter:
            query = query.eq("method", method_filter)
        if from_ts:
            query = query.gte("created_at", from_ts)
        if to_ts:
            query = query.lte("created_at", to_ts)

        scan_required = bool(search_term) or tab == "to_review" or bool(normalized_source) or bool(normalized_settlement)
        if scan_required:
            scan_limit = min(5000, max(limit + offset, 500))
            response = _timed_execute(
                "db.payments.list_admin.scan",
                lambda: query.range(0, scan_limit - 1).execute(),
            )
            rows = response.data or []
        else:
            response = _timed_execute(
                "db.payments.list_admin.page",
                lambda: query.range(offset, offset + limit - 1).execute(),
            )
            rows = response.data or []

        if tab == "to_review":
            rows = [
                row
                for row in rows
                if canonical_booking_status((row.get("reservation") or {}).get("status"))
                not in {"cancelled", "no_show", "checked_out"}
                and bool(row.get("proof_url") or row.get("reference_no"))
            ]

        if search_term:
            rows = [row for row in rows if _matches_payment_search(row, search_term)]

        if normalized_source:
            rows = [row for row in rows if _infer_payment_source(row) == normalized_source]

        if normalized_settlement == "partial":
            rows = [row for row in rows if str(row.get("payment_type") or "").lower() == "deposit"]
        elif normalized_settlement == "paid":
            rows = [row for row in rows if str(row.get("payment_type") or "").lower() != "deposit"]

        for row in rows:
            reservation = row.get("reservation")
            if isinstance(reservation, dict):
                reservation["status"] = canonical_booking_status(reservation.get("status"))

        paginated = rows[offset : offset + limit]
        if not scan_required and tab != "to_review":
            total = int(response.count or len(rows))
        else:
            total = len(rows)
        return _attach_latest_webhook_audit(_attach_admin_users(paginated)), total

    return _run(PAYMENT_SELECT)


def list_audit_logs(
    *,
    limit: int = 20,
    offset: int = 0,
    action: str | None = None,
    entity_type: str | None = None,
    anchored: str | None = None,
    from_ts: str | None = None,
    to_ts: str | None = None,
    search: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    client = get_supabase_client()
    query = (
        client.table("audit_logs")
        .select(AUDIT_LOG_SELECT, count="exact")
        .order("timestamp", desc=True)
    )

    if action:
        query = query.eq("action", action)
    if entity_type:
        query = query.eq("entity_type", entity_type)
    if anchored == "anchored":
        query = query.not_.is_("anchor_id", None)
    elif anchored == "unanchored":
        query = query.is_("anchor_id", None)
    if from_ts:
        query = query.gte("timestamp", from_ts)
    if to_ts:
        query = query.lte("timestamp", to_ts)
    if search:
        query = query.ilike("entity_id", f"%{search.strip()}%")

    response = _timed_execute(
        "db.audit.list.page",
        lambda: query.range(offset, offset + limit - 1).execute(),
    )
    return response.data or [], int(response.count or 0)


def list_units_admin(
    *,
    limit: int = 50,
    offset: int = 0,
    unit_type: str | None = None,
    is_active: bool | None = None,
    operational_status: str | None = None,
    search: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    client = get_supabase_client()
    query = (
        client.table("units")
        .select(UNIT_LIST_SELECT, count="exact")
        .order("type", desc=False)
        .order("name", desc=False)
    )
    if unit_type:
        query = query.eq("type", unit_type)
    if is_active is not None:
        query = query.eq("is_active", is_active)
    if operational_status:
        query = query.eq("operational_status", operational_status)
    if search:
        term = search.strip()
        if term:
            query = query.or_(f"name.ilike.%{term}%,description.ilike.%{term}%")

    response = _timed_execute(
        "db.units.list_admin.page",
        lambda: query.range(offset, offset + limit - 1).execute(),
    )
    return response.data or [], int(response.count or 0)


def list_active_units_public(
    *,
    unit_type: str | None = None,
    limit: int = 60,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Active units for the PUBLIC catalog (no auth). Marketing-safe projection only."""
    try:
        client = get_supabase_client()
        query = (
            client.table("units")
            .select(UNIT_PUBLIC_SELECT, count="exact")
            .eq("is_active", True)
            .order("type", desc=False)
            .order("base_price", desc=False)
        )
        if unit_type:
            query = query.eq("type", unit_type)
        response = _timed_execute(
            "db.units.list_public.page",
            lambda: query.range(offset, offset + limit - 1).execute(),
        )
        return response.data or [], int(response.count or 0)
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_unit_by_id(*, unit_id: str) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        response = (
            client.table("units")
            .select(UNIT_LIST_SELECT)
            .eq("unit_id", unit_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_my_profile(*, user_id: str) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        response = (
            client.table("users")
            .select("user_id,email,name,phone,wallet_address,wallet_chain")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def patch_my_profile(
    *,
    access_token: str,
    user_id: str,
    patch: dict[str, Any],
) -> dict[str, Any] | None:
    try:
        if not patch:
            return get_my_profile(user_id=user_id)
        client = get_supabase_user_scoped_client(access_token)
        client.table("users").update(patch).eq("user_id", user_id).execute()
        response = (
            client.table("users")
            .select("user_id,email,name,phone,wallet_address,wallet_chain")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def create_unit(*, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        client = get_supabase_client()
        response = (
            client.table("units")
            .insert(payload)
            .select(UNIT_LIST_SELECT)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            raise RuntimeError("Unit creation returned no data.")
        return rows[0]
    except RuntimeError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_unit(*, unit_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    try:
        if not payload:
            return None
        client = get_supabase_client()
        client.table("units").update(payload).eq("unit_id", unit_id).execute()
        response = client.table("units").select(UNIT_LIST_SELECT).eq("unit_id", unit_id).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def soft_delete_unit(*, unit_id: str) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        client.table("units").update({"is_active": False, "operational_status": "maintenance"}).eq("unit_id", unit_id).execute()
        response = client.table("units").select("unit_id,is_active").eq("unit_id", unit_id).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_unit_status(*, unit_id: str, is_active: bool) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        payload = {
            "is_active": is_active,
            "operational_status": "cleaned" if is_active else "maintenance",
        }
        client.table("units").update(payload).eq("unit_id", unit_id).execute()
        response = client.table("units").select(UNIT_LIST_SELECT).eq("unit_id", unit_id).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_reservation_unit_ids(*, reservation_id: str) -> list[str]:
    try:
        client = get_supabase_client()
        response = (
            client.table("reservation_units")
            .select("unit_id")
            .eq("reservation_id", reservation_id)
            .execute()
        )
        rows = response.data or []
        return [str(row.get("unit_id")) for row in rows if row.get("unit_id")]
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_units_operational_status(*, unit_ids: list[str], operational_status: str) -> int:
    if not unit_ids:
        return 0
    updated = 0
    try:
        client = get_supabase_client()
        for unit_id in unit_ids:
            client.table("units").update({"operational_status": operational_status}).eq("unit_id", unit_id).execute()
            updated += 1
        return updated
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_payments_by_reservation(
    *,
    reservation_id: str,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    client = get_supabase_client()
    response = (
        client.table("payments")
        .select(PAYMENT_SELECT, count="exact")
        .eq("reservation_id", reservation_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    rows = response.data or []
    return _attach_admin_users(rows), int(response.count or 0)


def list_report_transactions(
    *,
    from_ts: str,
    to_ts: str,
    status_filter: str | None = None,
    method: str | None = None,
    payment_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    try:
        client = get_supabase_client()
        query = (
            client.table("payments")
            .select(PAYMENT_TRANSACTION_SELECT, count="exact")
            .gte("created_at", from_ts)
            .lte("created_at", to_ts)
            .order("created_at", desc=True)
        )

        if status_filter:
            query = query.eq("status", status_filter)
        if method:
            query = query.eq("method", method)
        if payment_type:
            query = query.eq("payment_type", payment_type)

        response = _timed_execute(
            "db.reports.transactions.page",
            lambda: query.range(offset, offset + limit - 1).execute(),
        )
        rows = response.data or []
        normalized = []
        for row in rows:
            reservation = row.get("reservation") or {}
            normalized.append(
                {
                    "payment_id": row.get("payment_id"),
                    "reservation_code": reservation.get("reservation_code"),
                    "amount": row.get("amount"),
                    "status": row.get("status"),
                    "method": row.get("method"),
                    "payment_type": row.get("payment_type"),
                    "created_at": row.get("created_at"),
                    "verified_at": row.get("verified_at"),
                }
            )
        return normalized, int(response.count or 0)
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def submit_payment_proof(
    *,
    access_token: str,
    reservation_id: str,
    payment_type: str,
    amount: float,
    method: str,
    reference_no: str | None,
    proof_url: str | None,
) -> Any:
    try:
        client = get_supabase_user_scoped_client(access_token)
        response = client.rpc(
            "submit_payment_proof",
            {
                "p_reservation_id": reservation_id,
                "p_payment_type": payment_type,
                "p_amount": amount,
                "p_method": method,
                "p_reference_no": reference_no,
                "p_proof_url": proof_url,
            },
        ).execute()
        return response.data
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def record_on_site_payment(
    *,
    access_token: str,
    reservation_id: str,
    amount: float,
    method: str,
    reference_no: str | None,
) -> Any:
    try:
        client = get_supabase_user_scoped_client(access_token)
        response = client.rpc(
            "record_on_site_payment",
            {
                "p_reservation_id": reservation_id,
                "p_amount": amount,
                "p_method": method,
                "p_reference_no": reference_no,
            },
        ).execute()
        return response.data
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_payment_intent_amount(*, access_token: str, reservation_id: str, amount: float) -> None:
    try:
        client = get_supabase_user_scoped_client(access_token)
        client.rpc(
            "update_payment_intent_amount",
            {
                "p_reservation_id": reservation_id,
                "p_amount": amount,
            },
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def cancel_reservation(*, access_token: str, reservation_id: str) -> None:
    try:
        client = get_supabase_user_scoped_client(access_token)
        client.rpc(
            "cancel_reservation",
            {
                "p_reservation_id": reservation_id,
            },
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def verify_payment(payment_id: str, *, access_token: str, approved: bool = True) -> None:
    try:
        client = get_supabase_user_scoped_client(access_token)
        client.rpc(
            "verify_payment",
            {
                "p_payment_id": payment_id,
                "p_approved": approved,
            },
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def reject_payment(payment_id: str, *, access_token: str, reason: str) -> None:
    try:
        client = get_supabase_user_scoped_client(access_token)
        client.rpc(
            "reject_payment_with_reason",
            {
                "p_payment_id": payment_id,
                "p_rejected_reason": reason,
            },
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_payment_by_reference_no(*, reference_no: str) -> dict[str, Any] | None:
    reference_value = str(reference_no or "").strip()
    if not reference_value:
        return None
    try:
        client = get_supabase_client()
        response = (
            client.table("payments")
            .select("payment_id,reservation_id,reference_no,status,created_at")
            .eq("reference_no", reference_value)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def create_gateway_payment(
    *,
    reservation_id: str,
    amount: float,
    reference_no: str,
    method: str = "gcash",
    payment_type: str = "deposit",
    provider: str = "paymongo",
) -> dict[str, Any]:
    """Insert a pending gateway payment row (service role) and return it.

    Used when a hosted-checkout session is created; the row is reconciled to
    'verified' by the provider webhook once the guest pays.
    """
    try:
        client = get_supabase_client()
        response = (
            client.table("payments")
            .insert(
                {
                    "reservation_id": reservation_id,
                    "amount": amount,
                    "method": method,
                    "payment_type": payment_type,
                    "reference_no": reference_no,
                    "status": "pending",
                    "provider": provider,
                }
            )
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else {}
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def attach_paymongo_checkout(
    *,
    payment_id: str,
    checkout_session_id: str,
    checkout_url: str,
    payment_intent_id: str | None = None,
) -> None:
    """Persist the PayMongo checkout-session refs onto a payment row."""
    try:
        client = get_supabase_client()
        client.table("payments").update(
            {
                "paymongo_checkout_session_id": checkout_session_id,
                "paymongo_checkout_url": checkout_url,
                "paymongo_payment_intent_id": payment_intent_id,
            }
        ).eq("payment_id", payment_id).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_payment_by_id(*, payment_id: str) -> dict[str, Any] | None:
    value = str(payment_id or "").strip()
    if not value:
        return None
    try:
        client = get_supabase_client()
        response = (
            client.table("payments")
            .select("payment_id,reservation_id,status,amount")
            .eq("payment_id", value)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def set_paymongo_payment_id(*, payment_id: str, provider_payment_id: str) -> None:
    """Store the PayMongo payment id (pay_...) on our payment row for audit."""
    try:
        client = get_supabase_client()
        client.table("payments").update(
            {"paymongo_payment_id": provider_payment_id}
        ).eq("payment_id", payment_id).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_payment_by_paymongo_session(*, session_id: str) -> dict[str, Any] | None:
    value = str(session_id or "").strip()
    if not value:
        return None
    try:
        client = get_supabase_client()
        response = (
            client.table("payments")
            .select("payment_id,reservation_id,reference_no,status,amount")
            .eq("paymongo_checkout_session_id", value)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def verify_payment_service_role(payment_id: str, *, approved: bool = True) -> None:
    try:
        client = get_supabase_client()
        client.rpc(
            "verify_payment",
            {
                "p_payment_id": payment_id,
                "p_approved": approved,
            },
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def reject_payment_service_role(payment_id: str, *, reason: str) -> None:
    try:
        client = get_supabase_client()
        client.rpc(
            "reject_payment_with_reason",
            {
                "p_payment_id": payment_id,
                "p_rejected_reason": reason,
            },
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def validate_qr_checkin(*, access_token: str, reservation_code: str) -> dict[str, Any] | None:
    client = get_supabase_user_scoped_client(access_token)
    response = client.rpc(
        "validate_qr_checkin",
        {"p_reservation_code": reservation_code},
    ).execute()
    rows = response.data or []
    return rows[0] if rows else None


def create_qr_token_record(
    *,
    jti: str,
    reservation_id: str,
    reservation_code: str,
    rotation_version: int,
    signature: str,
    token_payload: str,
    expires_at: datetime,
) -> None:
    try:
        client = get_supabase_client()
        client.table("qr_tokens").insert(
            {
                "jti": jti,
                "reservation_id": reservation_id,
                "reservation_code": reservation_code,
                "rotation_version": rotation_version,
                "signature": signature,
                "token_payload": token_payload,
                "expires_at": expires_at.astimezone(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_qr_token_record(*, jti: str) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        response = (
            client.table("qr_tokens")
            .select(
                "jti,reservation_id,reservation_code,rotation_version,signature,token_payload,expires_at,consumed_at,revoked"
            )
            .eq("jti", jti)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def consume_qr_token_record(*, jti: str, scanner_id: str) -> bool:
    try:
        client = get_supabase_client()
        response = client.rpc(
            "consume_qr_token",
            {
                "p_jti": jti,
                "p_scanner_id": scanner_id,
            },
        ).execute()
        return bool(response.data)
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def perform_checkin(*, access_token: str, reservation_id: str, override_reason: str | None = None) -> None:
    client = get_supabase_user_scoped_client(access_token)
    client.rpc(
        "perform_checkin",
        {
            "p_reservation_id": reservation_id,
            "p_override_reason": override_reason,
        },
    ).execute()


def perform_checkout(*, access_token: str, reservation_id: str) -> None:
    client = get_supabase_user_scoped_client(access_token)
    client.rpc(
        "perform_checkout",
        {"p_reservation_id": reservation_id},
    ).execute()


def get_available_units(
    *,
    check_in_date: str,
    check_out_date: str,
    unit_type: str | None = None,
) -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        response = client.rpc(
            "get_available_units",
            {
                "p_check_in": check_in_date,
                "p_check_out": check_out_date,
                "p_unit_type": unit_type,
            },
        ).execute()
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_active_services() -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        response = _timed_execute(
            "db.services.list_active",
            lambda: client.table("services")
            .select(SERVICE_SELECT)
            .eq("status", "active")
            .order("service_type", desc=False)
            .execute(),
        )
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_all_services() -> list[dict[str, Any]]:
    """Admin: every tour/day-pass service regardless of status (for management)."""
    try:
        client = get_supabase_client()
        response = _timed_execute(
            "db.services.list_all",
            lambda: client.table("services")
            .select(SERVICE_SELECT)
            .order("service_type", desc=False)
            .order("service_name", desc=False)
            .execute(),
        )
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_service_images(
    *,
    service_id: str,
    image_urls: list[str],
    image_thumb_urls: list[str],
) -> dict[str, Any] | None:
    """Admin: replace the photo gallery for a tour service."""
    try:
        client = get_supabase_client()
        client.table("services").update(
            {"image_urls": image_urls, "image_thumb_urls": image_thumb_urls}
        ).eq("service_id", service_id).execute()
        response = (
            client.table("services")
            .select(SERVICE_SELECT)
            .eq("service_id", service_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_service(*, service_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    """Admin: update editable tour fields (rates, status). Returns the fresh row."""
    try:
        if not payload:
            return None
        client = get_supabase_client()
        client.table("services").update(payload).eq("service_id", service_id).execute()
        response = (
            client.table("services")
            .select(SERVICE_SELECT)
            .eq("service_id", service_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_active_resort_services(*, category: str | None = None) -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        query = client.table("resort_services").select(RESORT_SERVICE_SELECT).eq("is_active", True)
        if category:
            query = query.eq("category", category)
        response = _timed_execute(
            "db.resort_services.list_active",
            lambda: query.order("category", desc=False).order("service_name", desc=False).execute(),
        )
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_guest_active_checkin(*, user_id: str) -> dict[str, Any] | None:
    """The guest's currently checked-in reservation (a real room/cottage they
    occupy now), or None. Gates service requests — staff can only deliver to a
    guest who is actually checked in."""
    client = get_supabase_client()
    response = (
        client.table("reservations")
        .select("reservation_id, reservation_code, check_in_date, check_out_date, status")
        .eq("guest_user_id", user_id)
        .eq("status", "checked_in")
        .order("check_in_date", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def create_resort_service_request(
    *,
    access_token: str,
    guest_user_id: str,
    service_item_id: str,
    reservation_id: str | None = None,
    quantity: int = 1,
    preferred_time: str | None = None,
    notes: str | None = None,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_user_scoped_client(access_token)
        insert_payload = {
            "guest_user_id": guest_user_id,
            "service_item_id": service_item_id,
            "reservation_id": reservation_id,
            "quantity": quantity,
            "preferred_time": preferred_time,
            "notes": notes,
            "status": "new",
        }
        response = (
            client.table("resort_service_requests")
            .insert(insert_payload)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return None
        request_id = str(rows[0].get("request_id") or "")
        detail = (
            client.table("resort_service_requests")
            .select(RESORT_SERVICE_REQUEST_SELECT)
            .eq("request_id", request_id)
            .limit(1)
            .execute()
        )
        detail_rows = detail.data or []
        return detail_rows[0] if detail_rows else rows[0]
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_resort_service_requests(
    *,
    access_token: str,
    role: str,
    user_id: str,
    status_filter: str | None = None,
    category_filter: str | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    try:
        client = get_supabase_user_scoped_client(access_token)
        query = client.table("resort_service_requests").select(RESORT_SERVICE_REQUEST_SELECT, count="exact")
        if role not in ("staff", "admin", "super_admin"):
            query = query.eq("guest_user_id", user_id)
        if status_filter:
            query = query.eq("status", status_filter)
        if date_from:
            query = query.gte("requested_at", f"{date_from}T00:00:00+08:00")
        if date_to:
            query = query.lte("requested_at", f"{date_to}T23:59:59+08:00")
        query = query.order("requested_at", desc=True)
        if category_filter or search:
            response = query.range(0, 999).execute()
        else:
            response = query.range(offset, offset + limit - 1).execute()
        rows = response.data or []
        if category_filter:
            rows = [row for row in rows if str((row.get("service_item") or {}).get("category") or "") == category_filter]
        if search:
            needle = search.lower()
            rows = [
                row
                for row in rows
                if (
                    needle in str(row.get("request_id") or "").lower()
                    or needle in str(((row.get("reservation") or {}).get("reservation_code") or "")).lower()
                    or needle in str(((row.get("service_item") or {}).get("service_name") or "")).lower()
                    or needle in str(((row.get("guest") or {}).get("name") or "")).lower()
                    or needle in str(((row.get("guest") or {}).get("email") or "")).lower()
                )
            ]
        total = len(rows) if (category_filter or search) else int(response.count or len(rows))
        if category_filter or search:
            rows = rows[offset: offset + limit]
        return rows, total
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


# Valid service-request state machine: new -> in_progress -> done, with
# cancelled as a terminal off-ramp from any non-terminal state.
_SERVICE_REQUEST_TRANSITIONS: dict[str, set[str]] = {
    "new": {"in_progress", "cancelled"},
    "in_progress": {"done", "cancelled"},
    "done": set(),
    "cancelled": set(),
}


class ServiceRequestTransitionError(ValueError):
    """Raised when an admin tries an invalid service-request status change."""


def update_resort_service_request_status(
    *,
    access_token: str,
    request_id: str,
    status: str,
    processed_by_user_id: str,
    notes: str | None = None,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_user_scoped_client(access_token)

        # Enforce the state machine so a Done/Cancelled request can't be
        # re-opened and an invalid jump (e.g. new -> done) is rejected.
        current = (
            client.table("resort_service_requests")
            .select("status")
            .eq("request_id", request_id)
            .limit(1)
            .execute()
        )
        current_rows = current.data or []
        if not current_rows:
            return None
        current_status = str(current_rows[0].get("status"))
        if status != current_status and status not in _SERVICE_REQUEST_TRANSITIONS.get(current_status, set()):
            raise ServiceRequestTransitionError(
                f"Cannot change a {current_status.replace('_', ' ')} request to {status.replace('_', ' ')}."
            )

        payload: dict[str, Any] = {
            "status": status,
            "processed_by_user_id": processed_by_user_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if status in {"done", "cancelled"}:
            payload["processed_at"] = datetime.now(timezone.utc).isoformat()
        if notes is not None:
            payload["notes"] = notes

        client.table("resort_service_requests").update(payload).eq("request_id", request_id).execute()
        response = (
            client.table("resort_service_requests")
            .select(RESORT_SERVICE_REQUEST_SELECT)
            .eq("request_id", request_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except ServiceRequestTransitionError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_report_summary(
    *,
    access_token: str,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    try:
        client = get_supabase_user_scoped_client(access_token)
        response = _timed_execute(
            "db.reports.summary.rpc",
            lambda: client.rpc(
                "get_report_summary",
                {
                    "p_start_date": start_date,
                    "p_end_date": end_date,
                },
            ).execute(),
        )
        rows = response.data or []
        return rows[0] if rows else {}
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_report_daily(
    *,
    access_token: str,
    start_date: str,
    end_date: str,
) -> list[dict[str, Any]]:
    try:
        client = get_supabase_user_scoped_client(access_token)
        response = _timed_execute(
            "db.reports.daily.rpc",
            lambda: client.rpc(
                "get_report_daily",
                {
                    "p_start_date": start_date,
                    "p_end_date": end_date,
                },
            ).execute(),
        )
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_report_monthly(
    *,
    access_token: str,
    start_date: str,
    end_date: str,
) -> list[dict[str, Any]]:
    try:
        client = get_supabase_user_scoped_client(access_token)
        response = _timed_execute(
            "db.reports.monthly.rpc",
            lambda: client.rpc(
                "get_report_monthly",
                {
                    "p_start_date": start_date,
                    "p_end_date": end_date,
                },
            ).execute(),
        )
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_active_service_by_id(service_id: str) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        response = _timed_execute(
            "db.services.get_active",
            lambda: client.table("services")
            .select(SERVICE_SELECT)
            .eq("service_id", service_id)
            .eq("status", "active")
            .limit(1)
            .execute(),
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_daily_occupancy_history(*, days: int = 30) -> list[dict[str, Any]]:
    try:
        horizon = max(7, min(days, 180))
        since = (date.today() - timedelta(days=horizon)).isoformat()

        client = get_supabase_client()
        response = (
            client.table("reservations")
            .select("check_in_date,status,escrow_state")
            .gte("check_in_date", since)
            .order("check_in_date", desc=False)
            .execute()
        )
        rows = response.data or []

        counts_by_day: dict[str, int] = {}
        for row in rows:
            status_text = canonical_booking_status(row.get("status"))
            escrow_state = str(row.get("escrow_state") or "").lower()
            is_chain_confirmed = escrow_state in {"locked", "pending_release", "released", "refunded"}
            if status_text in {"cancelled", "no_show"}:
                continue
            if status_text not in {"confirmed", "checked_in", "checked_out"} and not is_chain_confirmed:
                continue
            check_in_date = str(row.get("check_in_date") or "").strip()
            if not check_in_date:
                continue
            counts_by_day[check_in_date] = counts_by_day.get(check_in_date, 0) + 1

        items: list[dict[str, Any]] = []
        start_day = date.today() - timedelta(days=horizon - 1)
        for index in range(horizon):
            day = start_day + timedelta(days=index)
            day_iso = day.isoformat()
            items.append(
                {
                    "date": day_iso,
                    "occupancy": float(counts_by_day.get(day_iso, 0)),
                }
            )
        return items
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_dynamic_pricing_signals(*, target_date: str | None = None, days: int = 30) -> dict[str, Any]:
    """
    Return aggregate, anonymized signals for AI dynamic pricing:
    - booking velocity
    - blockchain-confirmed booking velocity
    - chain confirm ratio
    - seasonal demand proxy
    """
    try:
        horizon = max(14, min(days, 180))
        since_day = date.today() - timedelta(days=horizon)
        since_iso = since_day.isoformat()

        parsed_target = date.today()
        if target_date:
            try:
                parsed_target = date.fromisoformat(target_date)
            except ValueError:
                parsed_target = date.today()

        client = get_supabase_client()
        response = (
            client.table("reservations")
            .select("created_at,check_in_date,status,escrow_state")
            .gte("created_at", f"{since_iso}T00:00:00+00:00")
            .order("created_at", desc=False)
            .execute()
        )
        rows = response.data or []

        now_utc = datetime.now(timezone.utc)
        created_24h = 0
        created_7d = 0
        chain_created_24h = 0
        chain_created_7d = 0
        chain_rows = 0
        chain_confirmed = 0
        target_month_count = 0
        monthly_counts: dict[int, int] = {month: 0 for month in range(1, 13)}

        for row in rows:
            created_raw = str(row.get("created_at") or "")
            check_in_raw = str(row.get("check_in_date") or "")
            status_text = canonical_booking_status(row.get("status"))
            escrow_state = str(row.get("escrow_state") or "").lower()

            created_dt: datetime | None = None
            if created_raw:
                try:
                    created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                except ValueError:
                    created_dt = None

            if created_dt is not None:
                delta_hours = (now_utc - created_dt).total_seconds() / 3600.0
                delta_days = (now_utc - created_dt).total_seconds() / 86400.0
                if delta_hours <= 24:
                    created_24h += 1
                    if escrow_state in {"locked", "pending_release", "released", "refunded"}:
                        chain_created_24h += 1
                if delta_days <= 7:
                    created_7d += 1
                    if escrow_state in {"locked", "pending_release", "released", "refunded"}:
                        chain_created_7d += 1

            if check_in_raw:
                try:
                    check_date = date.fromisoformat(check_in_raw)
                    monthly_counts[check_date.month] = monthly_counts.get(check_date.month, 0) + 1
                    if check_date.month == parsed_target.month:
                        target_month_count += 1
                except ValueError:
                    pass

            if status_text in {"cancelled", "no_show"}:
                continue
            if escrow_state in {"none", ""}:
                continue
            chain_rows += 1
            if escrow_state in {"locked", "pending_release", "released", "refunded"}:
                chain_confirmed += 1

        avg_daily_7d = created_7d / 7.0 if created_7d > 0 else 1.0
        booking_velocity = created_24h / avg_daily_7d if avg_daily_7d > 0 else 1.0

        avg_chain_daily_7d = chain_created_7d / 7.0 if chain_created_7d > 0 else 1.0
        blockchain_booking_velocity = chain_created_24h / avg_chain_daily_7d if avg_chain_daily_7d > 0 else booking_velocity

        non_zero_months = [value for value in monthly_counts.values() if value > 0]
        month_baseline = (sum(non_zero_months) / len(non_zero_months)) if non_zero_months else max(target_month_count, 1)
        seasonal_demand_index = target_month_count / month_baseline if month_baseline > 0 else 1.0

        chain_confirm_ratio = (chain_confirmed / chain_rows) if chain_rows > 0 else 0.7

        return {
            "booking_velocity": round(max(0.2, booking_velocity), 3),
            "blockchain_booking_velocity": round(max(0.2, blockchain_booking_velocity), 3),
            "chain_confirm_ratio": round(max(0.0, min(1.0, chain_confirm_ratio)), 3),
            "seasonal_demand_index": round(max(0.5, min(1.6, seasonal_demand_index)), 3),
            "window_days": horizon,
        }
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_anonymized_concierge_behavior(*, days: int = 90) -> dict[str, Any]:
    """
    Return anonymized guest behavior aggregates (no PII, no user IDs).
    Used by concierge recommendation endpoint.
    """
    try:
        horizon = max(30, min(days, 365))
        since_day = date.today() - timedelta(days=horizon)
        since_iso = since_day.isoformat()

        client = get_supabase_client()
        response = (
            client.table("service_bookings")
            .select("adult_qty,kid_qty,total_amount,service:services(service_type)")
            .gte("created_at", f"{since_iso}T00:00:00+00:00")
            .execute()
        )
        rows = response.data or []
        if not rows:
            return {
                "kid_ratio": 0.2,
                "avg_party_size": 3.0,
                "day_tour_ratio": 0.5,
                "dining_ratio": 0.5,
                "spend_index": 1.0,
                "sample_size": 0,
            }

        total_kids = 0.0
        total_pax = 0.0
        day_tour_count = 0
        dining_proxy_count = 0
        spend_values: list[float] = []

        for row in rows:
            adults = float(row.get("adult_qty") or 0)
            kids = float(row.get("kid_qty") or 0)
            service = row.get("service") or {}
            service_type = str(service.get("service_type") or "").lower()
            amount = float(row.get("total_amount") or 0)

            total_kids += kids
            total_pax += max(0.0, adults + kids)
            if "day" in service_type:
                day_tour_count += 1
            if "night" in service_type:
                dining_proxy_count += 1
            if amount > 0:
                spend_values.append(amount)

        sample_size = max(1, len(rows))
        avg_party_size = total_pax / sample_size if total_pax > 0 else 3.0
        kid_ratio = (total_kids / total_pax) if total_pax > 0 else 0.2
        day_tour_ratio = day_tour_count / sample_size
        dining_ratio = dining_proxy_count / sample_size
        avg_spend = (sum(spend_values) / len(spend_values)) if spend_values else 0.0
        spend_index = avg_spend / 1000.0 if avg_spend > 0 else 1.0

        return {
            "kid_ratio": round(max(0.0, min(1.0, kid_ratio)), 3),
            "avg_party_size": round(max(1.0, min(8.0, avg_party_size)), 3),
            "day_tour_ratio": round(max(0.0, min(1.0, day_tour_ratio)), 3),
            "dining_ratio": round(max(0.0, min(1.0, dining_ratio)), 3),
            "spend_index": round(max(0.5, min(2.0, spend_index)), 3),
            "sample_size": int(sample_size),
        }
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def insert_ai_occupancy_forecast(
    *,
    created_by_user_id: str,
    start_date: str,
    horizon_days: int,
    model_version: str,
    source: str,
    inputs: dict[str, Any],
    items: list[dict[str, Any]],
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        payload = {
            "forecast_type": "occupancy",
            "start_date": start_date,
            "horizon_days": horizon_days,
            "model_version": model_version,
            "source": source,
            "inputs": inputs,
            "series": items,
            "created_by_user_id": created_by_user_id,
        }
        response = client.table("ai_forecasts").insert(payload).execute()
        rows = response.data or []
        if rows and isinstance(rows[0], dict):
            return rows[0]

        # Some supabase client/runtime combinations don't return inserted rows by default.
        verify = (
            client.table("ai_forecasts")
            .select(AI_FORECAST_SELECT)
            .eq("forecast_type", "occupancy")
            .eq("start_date", start_date)
            .eq("horizon_days", horizon_days)
            .eq("model_version", model_version)
            .eq("source", source)
            .eq("created_by_user_id", created_by_user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        verify_rows = verify.data or []
        return verify_rows[0] if verify_rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_latest_ai_occupancy_forecast(
    *,
    start_date: str,
    horizon_days: int,
    model_prefix: str | None = None,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        query = (
            client.table("ai_forecasts")
            .select(AI_FORECAST_SELECT)
            .eq("forecast_type", "occupancy")
            .eq("start_date", start_date)
            .eq("horizon_days", horizon_days)
        )
        if model_prefix:
            query = query.like("model_version", f"{model_prefix}%")
        response = query.order("created_at", desc=True).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def get_latest_ai_occupancy_forecast_any() -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        response = (
            client.table("ai_forecasts")
            .select(AI_FORECAST_SELECT)
            .eq("forecast_type", "occupancy")
            .order("generated_at", desc=True)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def insert_ai_pricing_suggestion(
    *,
    created_by_user_id: str,
    reservation_id: str | None,
    segment_key: str | None,
    check_in_date: str | None,
    check_out_date: str | None,
    visit_date: str | None,
    suggested_multiplier: float | None,
    demand_bucket: str | None,
    pricing_adjustment: float,
    confidence: float,
    model_version: str,
    source: str,
    features: dict[str, Any],
    explanations: list[str],
    signal_breakdown: list[dict[str, Any]],
    confidence_breakdown: dict[str, Any] | None,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        payload = {
            "reservation_id": reservation_id,
            "segment_key": segment_key,
            "check_in_date": check_in_date,
            "check_out_date": check_out_date,
            "visit_date": visit_date,
            "suggested_multiplier": suggested_multiplier,
            "demand_bucket": demand_bucket,
            "pricing_adjustment": pricing_adjustment,
            "confidence": confidence,
            "model_version": model_version,
            "source": source,
            "features": features,
            "explanations": explanations,
            "signal_breakdown": signal_breakdown,
            "confidence_breakdown": confidence_breakdown or {},
            "created_by_user_id": created_by_user_id,
        }
        response = client.table("ai_pricing_suggestions").insert(payload).execute()
        rows = response.data or []
        if rows and isinstance(rows[0], dict):
            return rows[0]
        verify = (
            client.table("ai_pricing_suggestions")
            .select(AI_PRICING_SUGGESTION_SELECT)
            .eq("created_by_user_id", created_by_user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        verify_rows = verify.data or []
        return verify_rows[0] if verify_rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def insert_ai_concierge_suggestion(
    *,
    created_by_user_id: str,
    segment_key: str,
    stay_type: str | None,
    model_version: str,
    source: str,
    behavior: dict[str, Any],
    suggestions: list[dict[str, Any]],
    notes: list[str],
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        payload = {
            "segment_key": segment_key,
            "stay_type": stay_type,
            "model_version": model_version,
            "source": source,
            "behavior": behavior,
            "suggestions": suggestions,
            "notes": notes,
            "created_by_user_id": created_by_user_id,
        }
        response = client.table("ai_concierge_suggestions").insert(payload).execute()
        rows = response.data or []
        if rows and isinstance(rows[0], dict):
            return rows[0]
        verify = (
            client.table("ai_concierge_suggestions")
            .select(AI_CONCIERGE_SUGGESTION_SELECT)
            .eq("created_by_user_id", created_by_user_id)
            .eq("segment_key", segment_key)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        verify_rows = verify.data or []
        return verify_rows[0] if verify_rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def create_tour_reservation_atomic(
    *,
    access_token: str,
    guest_user_id: str,
    service_id: str,
    visit_date: str,
    adult_qty: int,
    kid_qty: int,
    is_advance: bool,
    expected_pay_now: float | None = None,
    notes: str | None = None,
    promo_code: str | None = None,
) -> dict[str, Any]:
    try:
        client = get_supabase_user_scoped_client(access_token)
        response = client.rpc(
            "create_tour_reservation_atomic",
            {
                "p_guest_user_id": guest_user_id,
                "p_service_id": service_id,
                "p_visit_date": visit_date,
                "p_adult_qty": adult_qty,
                "p_kid_qty": kid_qty,
                "p_is_advance": is_advance,
                "p_deposit_override": None,
                "p_expected_pay_now": expected_pay_now,
                "p_notes": notes,
                "p_promo_code": promo_code,
            },
        ).execute()
        rows = response.data or []
        if not rows:
            raise RuntimeError("Tour reservation creation returned no data.")
        return rows[0]
    except RuntimeError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def create_reservation_atomic(
    *,
    access_token: str,
    guest_user_id: str,
    check_in_date: str,
    check_out_date: str,
    unit_ids: list[str],
    rates: list[float],
    total_amount: float,
    guest_count: int = 1,
    deposit_required: float | None = None,
    expected_pay_now: float | None = None,
    notes: str | None = None,
    promo_code: str | None = None,
) -> dict[str, Any]:
    try:
        client = get_supabase_user_scoped_client(access_token)
        response = client.rpc(
            "create_reservation_atomic",
            {
                "p_guest_user_id": guest_user_id,
                "p_check_in": check_in_date,
                "p_check_out": check_out_date,
                "p_unit_ids": unit_ids,
                "p_rates": rates,
                "p_total_amount": total_amount,
                "p_guest_count": guest_count,
                "p_deposit_required": deposit_required,
                "p_expected_pay_now": expected_pay_now,
                "p_notes": notes,
                "p_promo_code": promo_code,
            },
        ).execute()
        rows = response.data or []
        if not rows:
            raise RuntimeError("Reservation creation returned no data.")
        return rows[0]
    except RuntimeError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def write_reservation_guest_pass_metadata(
    *,
    reservation_id: str,
    token_id: int,
    tx_hash: str,
    chain_key: str,
    reservation_hash: str,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        client.table("reservations").update(
            {
                "guest_pass_token_id": token_id,
                "guest_pass_tx_hash": tx_hash,
                "guest_pass_chain_key": chain_key,
                "guest_pass_reservation_hash": reservation_hash,
                "guest_pass_minted_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("reservation_id", reservation_id).execute()

        response = (
            client.table("reservations")
            .select(
                "reservation_id,guest_pass_token_id,guest_pass_tx_hash,"
                "guest_pass_chain_key,guest_pass_reservation_hash,guest_pass_minted_at"
            )
            .eq("reservation_id", reservation_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def write_reservation_escrow_shadow_metadata(
    *,
    reservation_id: str,
    chain_key: str,
    chain_id: int,
    contract_address: str,
    tx_hash: str,
    onchain_booking_id: str,
    escrow_event_index: int = 0,
    escrow_state: str = "pending_lock",
    escrow_release_attempts: int | None = None,
    escrow_release_last_attempt_at: str | None = None,
    escrow_release_last_error: str | None = None,
    clear_escrow_release_last_error: bool = False,
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()

        # Update first (this client version does not support .select() after .update().eq()).
        payload: dict[str, Any] = {
            "escrow_state": escrow_state,
            "chain_key": chain_key,
            "chain_id": chain_id,
            "escrow_contract_address": contract_address,
            "chain_tx_hash": tx_hash,
            "onchain_booking_id": onchain_booking_id,
            "escrow_event_index": escrow_event_index,
        }
        if escrow_release_attempts is not None:
            payload["escrow_release_attempts"] = int(max(0, escrow_release_attempts))
        if escrow_release_last_attempt_at is not None:
            payload["escrow_release_last_attempt_at"] = escrow_release_last_attempt_at
        if escrow_release_last_error is not None or clear_escrow_release_last_error:
            payload["escrow_release_last_error"] = escrow_release_last_error

        client.table("reservations").update(payload).eq("reservation_id", reservation_id).execute()

        # Read-back for response/debug.
        response = (
            client.table("reservations")
            .select(
                "reservation_id,escrow_state,chain_key,chain_id,"
                "escrow_contract_address,chain_tx_hash,onchain_booking_id,escrow_event_index,"
                "escrow_release_attempts,escrow_release_last_attempt_at,escrow_release_last_error"
            )
            .eq("reservation_id", reservation_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


# ============================================
# Escrow ledger (append-only deposit audit trail)
# ============================================
ESCROW_LEDGER_SELECT = (
    "ledger_id, reservation_id, reservation_code, event, escrow_state_from, "
    "escrow_state_to, policy_outcome, amount, reason, actor_role, actor_user_id, "
    "chain_tx_hash, metadata, created_at"
)


def record_escrow_transition(
    *,
    reservation_id: str,
    event: str,
    reservation_code: str | None = None,
    escrow_state_from: str | None = None,
    escrow_state_to: str | None = None,
    policy_outcome: str | None = None,
    amount: float | None = None,
    reason: str | None = None,
    actor_role: str | None = None,
    actor_user_id: str | None = None,
    chain_tx_hash: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Append one immutable escrow-ledger entry (service role).

    BEST-EFFORT: a failed audit write must never break the money operation it is
    recording (a refund, check-in release, or no-show forfeit), so all errors are
    swallowed and logged rather than raised."""
    if not reservation_id or not event:
        return
    try:
        client = get_supabase_client()
        payload: dict[str, Any] = {
            "reservation_id": reservation_id,
            "event": event,
            "reservation_code": reservation_code,
            "escrow_state_from": escrow_state_from,
            "escrow_state_to": escrow_state_to,
            "policy_outcome": policy_outcome,
            "amount": float(amount) if amount is not None else None,
            "reason": reason,
            "actor_role": actor_role,
            "actor_user_id": actor_user_id,
            "chain_tx_hash": chain_tx_hash,
            "metadata": metadata or {},
        }
        client.table("escrow_ledger").insert(payload).execute()
    except Exception:  # noqa: BLE001 - audit write must not break the caller
        import logging

        logging.getLogger(__name__).exception(
            "Failed to record escrow ledger entry (reservation_id=%s, event=%s)",
            reservation_id,
            event,
        )


def list_escrow_ledger(
    *,
    limit: int = 50,
    offset: int = 0,
    reservation_id: str | None = None,
    event: str | None = None,
    from_ts: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Return (rows, total) of escrow-ledger entries, newest first (service role)."""
    try:
        capped = max(1, min(int(limit), 200))
        start = max(0, int(offset))
        client = get_supabase_client()
        query = client.table("escrow_ledger").select(ESCROW_LEDGER_SELECT, count="exact")
        if reservation_id:
            query = query.eq("reservation_id", reservation_id)
        if event:
            query = query.eq("event", event)
        if from_ts:
            query = query.gte("created_at", from_ts)
        response = query.order("created_at", desc=True).range(start, start + capped - 1).execute()
        rows = response.data or []
        return rows, int(response.count or len(rows))
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


# ============================================
# In-app notifications
# ============================================
NOTIFICATION_SELECT = (
    "notification_id, category, event_type, title, body, severity, "
    "entity_type, entity_id, link, metadata, created_at, read_at"
)

_NOTIFICATION_ROLE_ORDER = ["guest", "staff", "admin", "super_admin"]


def _roles_at_least(min_role: str) -> list[str]:
    role = (min_role or "").lower()
    if role not in _NOTIFICATION_ROLE_ORDER:
        return ["super_admin"]
    return _NOTIFICATION_ROLE_ORDER[_NOTIFICATION_ROLE_ORDER.index(role):]


def list_notifications(
    *,
    recipient_user_id: str,
    limit: int = 20,
    offset: int = 0,
    unread_only: bool = False,
) -> tuple[list[dict[str, Any]], bool]:
    """Return (rows, has_more) for one page, newest first. Fetches one extra row
    beyond the page to tell the caller whether older notifications remain."""
    try:
        capped = max(1, min(limit, 100))
        start = max(0, offset)
        client = get_supabase_client()
        query = (
            client.table("notifications")
            .select(NOTIFICATION_SELECT)
            .eq("recipient_user_id", recipient_user_id)
        )
        if unread_only:
            query = query.is_("read_at", "null")
        # range() is inclusive on both ends, so request capped + 1 rows.
        response = (
            query.order("created_at", desc=True)
            .range(start, start + capped)
            .execute()
        )
        rows = response.data or []
        has_more = len(rows) > capped
        return rows[:capped], has_more
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def count_unread_notifications(*, recipient_user_id: str) -> int:
    try:
        client = get_supabase_client()
        response = (
            client.table("notifications")
            .select("notification_id", count="exact")
            .eq("recipient_user_id", recipient_user_id)
            .is_("read_at", "null")
            .execute()
        )
        return int(response.count or 0)
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def prune_read_notifications(*, retention_days: int = 90) -> int:
    """Delete read notifications older than the retention window (service-role
    only). Unread notifications are never pruned, regardless of age. Returns the
    number of rows deleted."""
    try:
        client = get_supabase_client()
        resp = client.rpc(
            "prune_read_notifications", {"p_retention_days": int(retention_days)}
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc
    data = resp.data
    try:
        return int(data)
    except (TypeError, ValueError):
        pass
    if isinstance(data, list) and data:
        row = data[0]
        if isinstance(row, dict):
            try:
                return int(row.get("prune_read_notifications"))
            except (TypeError, ValueError):
                return 0
    return 0


def mark_notifications_read(
    *,
    recipient_user_id: str,
    notification_ids: list[str] | None = None,
    mark_all: bool = False,
) -> int:
    try:
        client = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        query = (
            client.table("notifications")
            .update({"read_at": now_iso})
            .eq("recipient_user_id", recipient_user_id)
            .is_("read_at", "null")
        )
        if not mark_all:
            ids = [str(i) for i in (notification_ids or []) if i]
            if not ids:
                return 0
            query = query.in_("notification_id", ids)
        response = query.execute()
        return len(response.data or [])
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_user_ids_with_role_at_least(min_role: str) -> list[str]:
    try:
        client = get_supabase_client()
        response = (
            client.table("users")
            .select("user_id")
            .in_("role", _roles_at_least(min_role))
            .execute()
        )
        return [str(row["user_id"]) for row in (response.data or []) if row.get("user_id")]
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def emit_notification(
    *,
    recipient_user_id: str,
    category: str,
    event_type: str,
    title: str,
    body: str | None = None,
    severity: str = "info",
    entity_type: str | None = None,
    entity_id: str | None = None,
    link: str | None = None,
    metadata: dict[str, Any] | None = None,
    dedupe_key: str | None = None,
) -> bool:
    """Best-effort: notifications must never break the triggering operation."""
    try:
        client = get_supabase_client()
        if dedupe_key:
            existing = (
                client.table("notifications")
                .select("notification_id")
                .eq("recipient_user_id", recipient_user_id)
                .eq("dedupe_key", dedupe_key)
                .limit(1)
                .execute()
            )
            if existing.data:
                return False
        client.table("notifications").insert(
            {
                "recipient_user_id": recipient_user_id,
                "category": category,
                "event_type": event_type,
                "title": title,
                "body": body,
                "severity": severity,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "link": link,
                "metadata": metadata or {},
                "dedupe_key": dedupe_key,
            }
        ).execute()
        return True
    except Exception:  # noqa: BLE001 - best-effort, never raise
        return False


def emit_notification_to_roles(
    *,
    min_role: str,
    category: str,
    event_type: str,
    title: str,
    body: str | None = None,
    severity: str = "info",
    entity_type: str | None = None,
    entity_id: str | None = None,
    link: str | None = None,
    metadata: dict[str, Any] | None = None,
    dedupe_prefix: str | None = None,
) -> int:
    """Fan out one notification to every back-office user at/above min_role."""
    try:
        recipient_ids = list_user_ids_with_role_at_least(min_role)
    except Exception:  # noqa: BLE001
        return 0
    sent = 0
    for recipient_id in recipient_ids:
        dedupe_key = f"{dedupe_prefix}:{recipient_id}" if dedupe_prefix else None
        if emit_notification(
            recipient_user_id=recipient_id,
            category=category,
            event_type=event_type,
            title=title,
            body=body,
            severity=severity,
            entity_type=entity_type,
            entity_id=entity_id,
            link=link,
            metadata=metadata,
            dedupe_key=dedupe_key,
        ):
            sent += 1
    return sent


# --- Guest-facing notification emitters (best-effort) ---
def notify_guest_payment_decision(*, payment_id: str, approved: bool) -> None:
    """Notify the guest when their payment proof is verified or declined."""
    try:
        client = get_supabase_client()
        resp = (
            client.table("payments")
            .select("reservation_id")
            .eq("payment_id", payment_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        reservation_id = rows[0].get("reservation_id") if rows else None
        if not reservation_id:
            return
        reservation = get_reservation_by_id(str(reservation_id))
        if not reservation:
            return
        guest_user_id = reservation.get("guest_user_id")
        if not guest_user_id:
            return
        code = reservation.get("reservation_code") or "your booking"
        status_now = str(reservation.get("status") or "").lower()
        if approved:
            confirmed = status_now == "confirmed"
            emit_notification(
                recipient_user_id=str(guest_user_id),
                category="payment",
                event_type="payment.verified",
                title="Payment verified" + (" — booking confirmed" if confirmed else ""),
                body=(
                    f"Your payment for {code} was verified. Your QR pass is ready."
                    if confirmed
                    else f"Your payment for {code} was verified."
                ),
                severity="success",
                entity_type="reservation",
                entity_id=str(reservation_id),
                link="/my-bookings",
                dedupe_key=f"payment.verified:{payment_id}",
            )
        else:
            emit_notification(
                recipient_user_id=str(guest_user_id),
                category="payment",
                event_type="payment.declined",
                title="Payment proof declined",
                body=f"Your payment proof for {code} was declined. Please resubmit from your booking details.",
                severity="warning",
                entity_type="reservation",
                entity_id=str(reservation_id),
                link="/my-bookings",
                dedupe_key=f"payment.declined:{payment_id}",
            )
    except Exception:  # noqa: BLE001 - best-effort
        return


def notify_guest_checkin(reservation_row: dict[str, Any] | None) -> None:
    """Drop a "you're checked in" notification in the guest's bell when staff
    scans their QR. Separate from the staff-facing AI welcome record in
    guest_welcome_notifications — this is the guest's own confirmation."""
    try:
        if not isinstance(reservation_row, dict):
            return
        guest_user_id = reservation_row.get("guest_user_id")
        if not guest_user_id:
            return
        reservation_id = str(reservation_row.get("reservation_id") or "")
        code = reservation_row.get("reservation_code") or "your booking"
        emit_notification(
            recipient_user_id=str(guest_user_id),
            category="checkin",
            event_type="reservation.checked_in",
            title="You're checked in",
            body=f"Welcome to Hillside Hidden Resort! Your stay ({code}) is now active — enjoy your stay.",
            severity="success",
            entity_type="reservation",
            entity_id=reservation_id,
            link="/my-bookings",
            dedupe_key=f"reservation.checked_in:{reservation_id}",
        )
    except Exception:  # noqa: BLE001 - best-effort
        return


def notify_guest_service_request(row: dict[str, Any] | None) -> None:
    """Notify the guest when their resort-service request changes state."""
    try:
        if not isinstance(row, dict):
            return
        guest_user_id = row.get("guest_user_id")
        if not guest_user_id:
            return
        status_now = str(row.get("status") or "").lower()
        request_id = str(row.get("request_id") or "")
        service_item = row.get("service_item") if isinstance(row.get("service_item"), dict) else {}
        name = (service_item or {}).get("service_name") or "Your service request"
        plans = {
            "in_progress": ("service.in_progress", "Service in progress", f"{name} is being prepared.", "info"),
            "done": ("service.completed", "Service completed", f"{name} is ready.", "success"),
            "cancelled": ("service.cancelled", "Service request cancelled", f"{name} was cancelled.", "warning"),
        }
        plan = plans.get(status_now)
        if not plan:
            return
        event_type, title, body, severity = plan
        emit_notification(
            recipient_user_id=str(guest_user_id),
            category="service",
            event_type=event_type,
            title=title,
            body=body,
            severity=severity,
            entity_type="service_request",
            entity_id=request_id,
            link="/guest/services",
            dedupe_key=f"{event_type}:{request_id}",
        )
    except Exception:  # noqa: BLE001 - best-effort
        return


# --- Back-office notification emitters (fan-out, best-effort) ---
def notify_ops_payment_proof(*, reservation: dict[str, Any] | None, payment_id: str) -> None:
    """Tell managers a guest submitted a payment proof that needs verification."""
    try:
        if not isinstance(reservation, dict):
            return
        code = reservation.get("reservation_code") or "A reservation"
        emit_notification_to_roles(
            min_role="admin",
            category="payment",
            event_type="ops.payment_proof",
            title="Payment proof submitted",
            body=f"{code} submitted a payment proof for verification.",
            severity="info",
            entity_type="reservation",
            entity_id=str(reservation.get("reservation_id") or ""),
            link="/admin/payments",
            dedupe_prefix=f"ops.payment_proof:{payment_id}",
        )
    except Exception:  # noqa: BLE001 - best-effort
        return


def notify_ops_new_service_request(row: dict[str, Any] | None) -> None:
    """Tell front-desk/managers a guest raised a new resort-service request."""
    try:
        if not isinstance(row, dict):
            return
        request_id = str(row.get("request_id") or "")
        service_item = row.get("service_item") if isinstance(row.get("service_item"), dict) else {}
        name = (service_item or {}).get("service_name") or "a resort service"
        quantity = row.get("quantity")
        reservation = row.get("reservation") if isinstance(row.get("reservation"), dict) else {}
        code = (reservation or {}).get("reservation_code")
        body = (
            f"A guest requested {name}"
            + (f" (x{quantity})" if quantity else "")
            + (f" for {code}" if code else "")
            + "."
        )
        emit_notification_to_roles(
            min_role="staff",
            category="service",
            event_type="ops.service_request",
            title="New service request",
            body=body,
            severity="info",
            entity_type="service_request",
            entity_id=request_id,
            link="/admin/services",
            dedupe_prefix=f"ops.service_request:{request_id}",
        )
    except Exception:  # noqa: BLE001 - best-effort
        return


def notify_ops_payment_received(
    *,
    reservation: dict[str, Any] | None,
    amount: float | None = None,
    channel: str = "online",
    method: str | None = None,
    payment_ref: str | None = None,
) -> None:
    """Tell managers a payment came in. Managers + System Admin only.
    - channel="online": guest paid the deposit online (PayMongo webhook).
    - channel="on_site": Front Desk recorded a cash/desk payment — a walk-in's
      payment or a guest settling their balance at the counter. `method` is the
      tender (cash/gcash/bank/card) and `payment_ref` keys the dedupe so a booking
      that takes several on-site payments notifies for each one."""
    try:
        if not isinstance(reservation, dict):
            return
        code = reservation.get("reservation_code") or "A reservation"
        reservation_id = str(reservation.get("reservation_id") or "")
        amount_paren = f" (₱{amount:,.0f})" if amount and amount > 0 else ""
        status = str(reservation.get("status") or "").lower()
        if channel == "on_site":
            method_labels = {"cash": "cash", "gcash": "GCash", "bank": "bank transfer", "card": "card"}
            method_str = method_labels.get(str(method or "").lower(), "on-site")
            tail = "the booking is now confirmed." if status == "confirmed" else "balance updated."
            body = f"{code} paid{amount_paren} on-site ({method_str}) — {tail}"
            event_type = "ops.payment_received_onsite"
            dedupe = f"ops.payment_received_onsite:{reservation_id}:{payment_ref or amount}"
        else:
            body = f"{code} paid the deposit online{amount_paren} — the booking is now confirmed."
            event_type = "ops.payment_received"
            dedupe = f"ops.payment_received:{reservation_id}"
        emit_notification_to_roles(
            min_role="admin",
            category="payment",
            event_type=event_type,
            title="Payment received",
            body=body,
            severity="success",
            entity_type="reservation",
            entity_id=reservation_id,
            link="/admin/payments",
            dedupe_prefix=dedupe,
        )
    except Exception:  # noqa: BLE001 - best-effort
        return


def notify_ops_paid_cancellation(
    *, reservation: dict[str, Any] | None, outcome: str, amount: float | None = None
) -> None:
    """Tell managers a PAID booking was cancelled — a refund may be due (admin
    cancel) or the deposit was forfeited (guest cancel). Managers + System Admin
    only. Never fired for unpaid bookings."""
    try:
        if not isinstance(reservation, dict):
            return
        code = reservation.get("reservation_code") or "A reservation"
        reservation_id = str(reservation.get("reservation_id") or "")
        amount_str = f"₱{amount:,.0f}" if amount and amount > 0 else "the deposit"
        if str(outcome).lower() == "refunded":
            title = "Refund may be due"
            body = f"{code} was cancelled after paying {amount_str}. Review whether a refund is owed in Payments."
            severity = "warning"
            link = "/admin/payments"
        else:
            title = "Paid booking cancelled"
            body = f"{code} was cancelled by the guest; {amount_str} is forfeited per policy. The unit/slot is now free."
            severity = "info"
            link = "/admin/reservations"
        emit_notification_to_roles(
            min_role="admin",
            category="payment",
            event_type="ops.paid_cancellation",
            title=title,
            body=body,
            severity=severity,
            entity_type="reservation",
            entity_id=reservation_id,
            link=link,
            dedupe_prefix=f"ops.paid_cancellation:{reservation_id}",
        )
    except Exception:  # noqa: BLE001 - best-effort
        return


# --- Scheduled reminders ---
def _friendly_when(check_in_iso: str, today: date) -> str:
    try:
        target = date.fromisoformat(str(check_in_iso))
    except (TypeError, ValueError):
        return "coming up"
    delta = (target - today).days
    if delta <= 0:
        return "today"
    if delta == 1:
        return "tomorrow"
    return f"in {delta} days"


def list_confirmed_reservations_starting_within(*, days: int) -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        today = date.today()
        end = today + timedelta(days=max(0, days))
        response = (
            client.table("reservations")
            .select("reservation_id, reservation_code, guest_user_id, check_in_date, status")
            .eq("status", "confirmed")
            .gte("check_in_date", today.isoformat())
            .lte("check_in_date", end.isoformat())
            .limit(500)
            .execute()
        )
        return response.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def emit_upcoming_stay_reminders(*, lookahead_days: int = 2) -> int:
    """Notify guests whose confirmed stay/tour starts within the lookahead window.
    Deduped per reservation so the reminder fires once. Best-effort."""
    try:
        rows = list_confirmed_reservations_starting_within(days=lookahead_days)
    except Exception:  # noqa: BLE001
        return 0
    today = date.today()
    sent = 0
    for row in rows:
        guest_user_id = row.get("guest_user_id")
        reservation_id = row.get("reservation_id")
        if not guest_user_id or not reservation_id:
            continue
        code = row.get("reservation_code") or "your booking"
        when = _friendly_when(str(row.get("check_in_date") or ""), today)
        if emit_notification(
            recipient_user_id=str(guest_user_id),
            category="reservation",
            event_type="reservation.upcoming",
            title="Upcoming reservation",
            body=f"Your booking {code} is {when}. Have your QR pass ready for check-in.",
            severity="info",
            entity_type="reservation",
            entity_id=str(reservation_id),
            link="/my-bookings",
            dedupe_key=f"reservation.upcoming:{reservation_id}",
        ):
            sent += 1
    return sent


# ============================================
# Guest reviews
# ============================================
REVIEW_SELECT = (
    "review_id, reservation_id, unit_id, rating, comment, created_at, "
    "guest:users!guest_user_id(name)"
)


def _review_first_name(row: dict[str, Any]) -> str | None:
    guest = row.get("guest") if isinstance(row.get("guest"), dict) else {}
    name = (guest or {}).get("name")
    if not name:
        return None
    parts = str(name).strip().split()
    return parts[0] if parts else None


def _review_row_to_item(row: dict[str, Any], *, include_name: bool) -> dict[str, Any]:
    return {
        "review_id": str(row.get("review_id")),
        "reservation_id": str(row.get("reservation_id")),
        "unit_id": str(row.get("unit_id")),
        "rating": int(row.get("rating") or 0),
        "comment": row.get("comment"),
        "guest_name": _review_first_name(row) if include_name else None,
        "created_at": str(row.get("created_at") or ""),
    }


def create_review(
    *,
    guest_user_id: str,
    reservation_id: str,
    rating: int,
    comment: str | None,
) -> dict[str, Any]:
    """Insert a review after verifying the reservation is the guest's own and
    checked out. Raises ValueError for rule violations, RuntimeError for DB errors."""
    try:
        client = get_supabase_client()
        resp = (
            client.table("reservations")
            .select("reservation_id, guest_user_id, status")
            .eq("reservation_id", reservation_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc

    if not rows:
        raise ValueError("Reservation not found.")
    reservation = rows[0]
    if str(reservation.get("guest_user_id")) != str(guest_user_id):
        raise PermissionError("You can only review your own stay.")
    if str(reservation.get("status") or "").lower() != "checked_out":
        raise ValueError("You can leave a review after your stay is checked out.")

    try:
        unit_ids = list_reservation_unit_ids(reservation_id=reservation_id)
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc
    if not unit_ids:
        raise ValueError("This booking has no stay to review.")

    safe_rating = max(1, min(5, int(rating)))
    safe_comment = (comment or "").strip() or None

    try:
        client = get_supabase_client()
        existing = (
            client.table("reviews")
            .select("review_id")
            .eq("reservation_id", reservation_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            raise ValueError("You've already reviewed this stay.")
        inserted = (
            client.table("reviews")
            .insert(
                {
                    "reservation_id": reservation_id,
                    "unit_id": str(unit_ids[0]),
                    "guest_user_id": guest_user_id,
                    "rating": safe_rating,
                    "comment": safe_comment,
                }
            )
            .execute()
        )
    except ValueError:
        raise
    except Exception as exc:  # noqa: BLE001
        message = str(getattr(exc, "message", None) or exc).lower()
        if "duplicate" in message or "unique" in message or "23505" in message:
            raise ValueError("You've already reviewed this stay.") from exc
        raise _runtime_error_from_exception(exc) from exc

    created = (inserted.data or [{}])[0]
    return _review_row_to_item({**created, "guest": {}}, include_name=False)


def list_my_reviews(*, guest_user_id: str) -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        resp = (
            client.table("reviews")
            .select(REVIEW_SELECT)
            .eq("guest_user_id", guest_user_id)
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        )
        return [_review_row_to_item(row, include_name=False) for row in (resp.data or [])]
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def list_unit_reviews(*, unit_id: str, limit: int = 20) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        client = get_supabase_client()
        resp = (
            client.table("reviews")
            .select(REVIEW_SELECT)
            .eq("unit_id", unit_id)
            .eq("is_hidden", False)
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc
    ratings = [int(r.get("rating") or 0) for r in rows if r.get("rating")]
    count = len(ratings)
    average = round(sum(ratings) / count, 2) if count else 0.0
    items = [_review_row_to_item(row, include_name=True) for row in rows[: max(1, min(limit, 50))]]
    return items, {"average_rating": average, "review_count": count}


# --- Admin review moderation ---
ADMIN_REVIEW_SELECT = (
    "review_id, reservation_id, unit_id, rating, comment, is_hidden, created_at, "
    "guest:users!guest_user_id(name), unit:units(name)"
)


def _admin_review_row(row: dict[str, Any]) -> dict[str, Any]:
    guest = row.get("guest") if isinstance(row.get("guest"), dict) else {}
    unit = row.get("unit") if isinstance(row.get("unit"), dict) else {}
    return {
        "review_id": str(row.get("review_id")),
        "unit_id": str(row.get("unit_id")),
        "unit_name": (unit or {}).get("name"),
        "guest_name": (guest or {}).get("name"),
        "rating": int(row.get("rating") or 0),
        "comment": row.get("comment"),
        "is_hidden": bool(row.get("is_hidden")),
        "created_at": str(row.get("created_at") or ""),
    }


def list_reviews_for_admin(*, limit: int = 100) -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        resp = (
            client.table("reviews")
            .select(ADMIN_REVIEW_SELECT)
            .order("created_at", desc=True)
            .limit(max(1, min(limit, 200)))
            .execute()
        )
        return [_admin_review_row(row) for row in (resp.data or [])]
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def set_review_hidden(*, review_id: str, hidden: bool) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        client.table("reviews").update(
            {"is_hidden": bool(hidden), "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("review_id", review_id).execute()
        resp = (
            client.table("reviews")
            .select(ADMIN_REVIEW_SELECT)
            .eq("review_id", review_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return _admin_review_row(rows[0]) if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


# ---------------------------------------------------------------------------
# Team / account management (System Admin + Manager)
# ---------------------------------------------------------------------------

_TEAM_ROLES = ("staff", "admin", "super_admin")


def _roles_creatable_by(actor_role: str | None) -> set[str]:
    """Roles an actor may grant — enforces the no-privilege-escalation rule.

    System Admin can grant any back-office role; Manager can grant Front Desk
    only (never another Manager or System Admin). Everyone else: nothing.
    """
    actor = (actor_role or "").strip().lower()
    if actor == "super_admin":
        return {"staff", "admin", "super_admin"}
    if actor == "admin":
        return {"staff"}
    return set()


def _record_user_audit(
    *, performed_by: str | None, entity_id: str, action: str, metadata: dict[str, Any]
) -> None:
    """Best-effort audit row for account/role changes. Never raises."""
    try:
        client = get_supabase_client()
        payload: dict[str, Any] = {
            "performed_by_user_id": performed_by,
            "entity_type": "user",
            "entity_id": str(entity_id),
            "action": action,
            "metadata": metadata,
        }
        canonical = json.dumps(payload, sort_keys=True, default=str)
        payload["data_hash"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        client.table("audit_logs").insert(payload).execute()
    except Exception:  # noqa: BLE001 - auditing must never block the action
        pass


def list_team_members() -> list[dict[str, Any]]:
    """All back-office users (Front Desk, Manager, System Admin), oldest first."""
    try:
        client = get_supabase_client()
        resp = (
            client.table("users")
            .select("user_id,name,email,role,created_at")
            .in_("role", list(_TEAM_ROLES))
            .order("created_at", desc=False)
            .execute()
        )
        items: list[dict[str, Any]] = []
        for row in resp.data or []:
            items.append(
                {
                    "user_id": str(row.get("user_id")),
                    "name": row.get("name"),
                    "email": row.get("email"),
                    "role": str(row.get("role") or "guest"),
                    "created_at": str(row.get("created_at") or ""),
                }
            )
        return items
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def create_team_member(
    *,
    actor_user_id: str,
    actor_role: str | None,
    name: str,
    email: str,
    role: str,
    password: str,
) -> dict[str, Any]:
    """Create a back-office account via the Supabase admin API and set its role.

    Enforces the grant rule server-side, so the frontend dropdown is convenience
    only. Raises PermissionError / ValueError / RuntimeError for the route layer.
    """
    role = (role or "").strip().lower()
    email = (email or "").strip().lower()
    name = (name or "").strip()
    if role not in _roles_creatable_by(actor_role):
        raise PermissionError("You don't have permission to create that role.")
    if not name:
        raise ValueError("A name is required.")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ValueError("A valid email address is required.")
    if len(password or "") < 8:
        raise ValueError("Temporary password must be at least 8 characters.")
    try:
        client = get_supabase_client()
        created = client.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"name": name},
            }
        )
        user = getattr(created, "user", None)
        new_id = getattr(user, "id", None) if user is not None else None
        if not new_id:
            raise RuntimeError("The account could not be created.")
        # handle_new_user inserts a users row (role 'guest'); upsert to set the
        # profile + granted role. Service-role context bypasses the
        # prevent_non_admin_role_change trigger, so the role write is allowed.
        client.table("users").upsert(
            {"user_id": str(new_id), "name": name, "email": email, "role": role},
            on_conflict="user_id",
        ).execute()
        _record_user_audit(
            performed_by=actor_user_id,
            entity_id=str(new_id),
            action="create",
            metadata={"email": email, "role": role, "by_role": (actor_role or "")},
        )
        return {
            "user_id": str(new_id),
            "name": name,
            "email": email,
            "role": role,
            "created_at": "",
        }
    except (PermissionError, ValueError):
        raise
    except Exception as exc:  # noqa: BLE001
        message = str(getattr(exc, "message", None) or exc).lower()
        if any(token in message for token in ("already", "exists", "registered", "duplicate")):
            raise ValueError(
                "An account with this email already exists."
            ) from exc
        raise _runtime_error_from_exception(exc) from exc


def update_team_member_role(
    *, actor_user_id: str, actor_role: str | None, target_user_id: str, new_role: str
) -> dict[str, Any]:
    """Change a team member's role, guarded by the grant rule + safety checks."""
    new_role = (new_role or "").strip().lower()
    creatable = _roles_creatable_by(actor_role)
    # Allow granting a role you're permitted to grant, or demoting to 'guest'
    # (remove back-office access). The target's *current* role must also be one
    # you can manage, so a Manager can never touch a Manager / System Admin.
    if new_role not in creatable and new_role != "guest":
        raise PermissionError("You can't assign that role.")
    if str(target_user_id) == str(actor_user_id):
        raise ValueError("You can't change your own role.")
    try:
        client = get_supabase_client()
        resp = (
            client.table("users")
            .select("user_id,name,email,role")
            .eq("user_id", target_user_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            raise ValueError("That account no longer exists.")
        target = rows[0]
        current = str(target.get("role") or "guest").lower()
        if current not in creatable and current != "guest":
            raise PermissionError("You can't manage that account.")
        if current == new_role:
            return {
                "user_id": str(target_user_id),
                "name": target.get("name"),
                "email": target.get("email"),
                "role": new_role,
                "created_at": "",
            }
        # Never strand the system: keep at least one System Admin.
        if current == "super_admin" and new_role != "super_admin":
            count_resp = (
                client.table("users")
                .select("user_id", count="exact")
                .eq("role", "super_admin")
                .execute()
            )
            if int(count_resp.count or 0) <= 1:
                raise ValueError("You can't change the last System Admin.")
        client.table("users").update({"role": new_role}).eq(
            "user_id", target_user_id
        ).execute()
        _record_user_audit(
            performed_by=actor_user_id,
            entity_id=str(target_user_id),
            action="update",
            metadata={"from": current, "to": new_role, "by_role": (actor_role or "")},
        )
        return {
            "user_id": str(target_user_id),
            "name": target.get("name"),
            "email": target.get("email"),
            "role": new_role,
            "created_at": "",
        }
    except (PermissionError, ValueError):
        raise
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


# ---------------------------------------------------------------------------
# Promo codes (discounts)
# ---------------------------------------------------------------------------


def _parse_iso_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:  # noqa: BLE001
        return None


def _promo_row(row: dict[str, Any]) -> dict[str, Any]:
    def num(value: Any) -> float | None:
        try:
            return None if value is None else float(value)
        except Exception:  # noqa: BLE001
            return None

    def intval(value: Any) -> int | None:
        try:
            return None if value is None else int(value)
        except Exception:  # noqa: BLE001
            return None

    return {
        "promo_id": str(row.get("promo_id")),
        "code": row.get("code") or None,
        "description": row.get("description"),
        "discount_type": str(row.get("discount_type") or "percent"),
        "discount_value": num(row.get("discount_value")) or 0,
        "max_discount": num(row.get("max_discount")),
        "min_total": num(row.get("min_total")) or 0,
        "starts_at": row.get("starts_at"),
        "ends_at": row.get("ends_at"),
        "usage_limit": intval(row.get("usage_limit")),
        "used_count": intval(row.get("used_count")) or 0,
        "per_user_limit": intval(row.get("per_user_limit")),
        "applies_to": str(row.get("applies_to") or "stays"),
        "auto_apply": bool(row.get("auto_apply")),
        "is_active": bool(row.get("is_active")),
        "created_at": str(row.get("created_at") or ""),
    }


def _compute_promo_discount(promo: dict[str, Any], total: float) -> float:
    discount_type = str(promo.get("discount_type") or "percent")
    value = float(promo.get("discount_value") or 0)
    if discount_type == "percent":
        discount = round(float(total) * value / 100.0, 2)
        max_discount = promo.get("max_discount")
        if max_discount is not None:
            discount = min(discount, float(max_discount))
    else:
        discount = value
    return round(min(max(discount, 0.0), float(total)), 2)


def _promo_eligible(promo: dict[str, Any], total: float, kind: str, user_id: str | None, client) -> bool:
    if not promo or not promo.get("is_active"):
        return False
    if str(promo.get("applies_to") or "stays") not in (kind, "all"):
        return False
    now = datetime.now(timezone.utc)
    starts = _parse_iso_dt(promo.get("starts_at"))
    ends = _parse_iso_dt(promo.get("ends_at"))
    if starts and now < starts:
        return False
    if ends and now > ends:
        return False
    if float(total) < float(promo.get("min_total") or 0):
        return False
    usage_limit = promo.get("usage_limit")
    if usage_limit is not None and int(promo.get("used_count") or 0) >= int(usage_limit):
        return False
    per_user_limit = promo.get("per_user_limit")
    if per_user_limit is not None and user_id:
        cnt = (
            client.table("promo_redemptions")
            .select("redemption_id", count="exact")
            .eq("promo_id", promo.get("promo_id"))
            .eq("user_id", user_id)
            .execute()
        )
        if int(cnt.count or 0) >= int(per_user_limit):
            return False
    return True


def validate_promo_code(
    *, code: str, total: float, user_id: str | None = None, kind: str = "stays"
) -> dict[str, Any]:
    """Preview a promo against a draft total. Read-only — the authoritative discount
    is re-applied (and redeemed) inside the reservation RPC. An empty code returns
    the best auto-apply promo for the kind (silent if none)."""
    norm = (code or "").strip().upper()
    kind = (kind or "stays").strip().lower()
    if kind not in ("stays", "tours"):
        kind = "stays"

    def invalid(message: str | None) -> dict[str, Any]:
        return {
            "valid": False,
            "code": code or "",
            "discount_type": None,
            "discount_value": None,
            "discount_amount": 0,
            "new_total": round(float(total or 0), 2),
            "message": message,
        }

    def ok(promo: dict[str, Any], discount: float) -> dict[str, Any]:
        return {
            "valid": True,
            "code": str(promo.get("code") or ""),
            "discount_type": str(promo.get("discount_type") or "percent"),
            "discount_value": float(promo.get("discount_value") or 0),
            "discount_amount": round(discount, 2),
            "new_total": round(float(total) - discount, 2),
            "message": None,
        }

    try:
        client = get_supabase_client()
        if not norm:
            # Auto-apply preview: pick the best eligible auto promo for this kind.
            resp = (
                client.table("promo_codes")
                .select("*")
                .eq("is_active", True)
                .eq("auto_apply", True)
                .execute()
            )
            best: dict[str, Any] | None = None
            best_discount = 0.0
            for promo in resp.data or []:
                if not _promo_eligible(promo, total, kind, user_id, client):
                    continue
                discount = _compute_promo_discount(promo, total)
                if discount > best_discount:
                    best_discount = discount
                    best = promo
            if best is not None and best_discount > 0:
                return ok(best, best_discount)
            return invalid(None)  # no auto promo — silent

        resp = client.table("promo_codes").select("*").ilike("code", norm).limit(1).execute()
        rows = [r for r in (resp.data or []) if str(r.get("code") or "").strip().upper() == norm]
        promo = rows[0] if rows else None
        if not promo or not promo.get("is_active"):
            return invalid("This promo code is not valid.")
        if str(promo.get("applies_to") or "stays") not in (kind, "all"):
            return invalid(f"This promo code does not apply to {kind}.")
        now = datetime.now(timezone.utc)
        starts = _parse_iso_dt(promo.get("starts_at"))
        ends = _parse_iso_dt(promo.get("ends_at"))
        if starts and now < starts:
            return invalid("This promo code is not active yet.")
        if ends and now > ends:
            return invalid("This promo code has expired.")
        min_total = float(promo.get("min_total") or 0)
        if float(total) < min_total:
            return invalid(f"Add ₱{int(min_total)} more to use this promo (minimum spend).")
        usage_limit = promo.get("usage_limit")
        if usage_limit is not None and int(promo.get("used_count") or 0) >= int(usage_limit):
            return invalid("This promo code has been fully redeemed.")
        per_user_limit = promo.get("per_user_limit")
        if per_user_limit is not None and user_id:
            cnt = (
                client.table("promo_redemptions")
                .select("redemption_id", count="exact")
                .eq("promo_id", promo.get("promo_id"))
                .eq("user_id", user_id)
                .execute()
            )
            if int(cnt.count or 0) >= int(per_user_limit):
                return invalid("You have already used this promo code.")
        return ok(promo, _compute_promo_discount(promo, total))
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def release_expired_holds(*, window_minutes: int = 120) -> list[dict[str, Any]]:
    """Cancel pending_payment reservations older than the window (frees the held
    unit/slot), then best-effort notify each guest. Returns the released rows."""
    try:
        client = get_supabase_client()
        resp = client.rpc(
            "release_expired_holds", {"p_window_minutes": int(window_minutes)}
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc

    # Phrase the window the way a guest reads it ("2 hours", "90 minutes").
    if window_minutes % 60 == 0:
        _hrs = window_minutes // 60
        window_phrase = f"{_hrs} hour" + ("s" if _hrs != 1 else "")
    else:
        window_phrase = f"{window_minutes} minutes"

    def _fmt_deadline(raw: Any) -> str | None:
        # Render the true hold-expiry moment in PH local time (UTC+8, no DST), so
        # the message reflects WHEN the hold lapsed regardless of when this job ran.
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            local = parsed.astimezone(timezone(timedelta(hours=8)))
            return local.strftime("%b %d, %Y at %I:%M %p")
        except Exception:  # noqa: BLE001
            return None

    released: list[dict[str, Any]] = []
    for row in resp.data or []:
        reservation_id = str(row.get("reservation_id") or "")
        guest_user_id = row.get("guest_user_id")
        reservation_code = str(row.get("reservation_code") or "")
        hold_expired_at = row.get("hold_expired_at")
        if not reservation_id:
            continue
        released.append(
            {
                "reservation_id": reservation_id,
                "reservation_code": reservation_code,
                "guest_user_id": str(guest_user_id) if guest_user_id else None,
                "hold_expired_at": hold_expired_at,
            }
        )
        if guest_user_id:
            deadline_str = _fmt_deadline(hold_expired_at)
            if deadline_str:
                body = (
                    f"Reservation {reservation_code} was released because the deposit "
                    f"wasn't completed within {window_phrase} of booking "
                    f"(deadline {deadline_str}). You're welcome to book again anytime."
                )
            else:
                body = (
                    f"Reservation {reservation_code} was released because the deposit "
                    f"wasn't completed within {window_phrase} of booking. "
                    "You're welcome to book again anytime."
                )
            emit_notification(
                recipient_user_id=str(guest_user_id),
                category="reservation",
                event_type="reservation.released",
                title="Booking released",
                body=body,
                severity="warning",
                entity_type="reservation",
                entity_id=reservation_id,
                link="/my-bookings",
                metadata=(
                    {"hold_expired_at": str(hold_expired_at)} if hold_expired_at else None
                ),
                dedupe_key=f"released:{reservation_id}",
            )
    return released


def mark_expired_no_shows(*, grace_days: int = 1) -> list[dict[str, Any]]:
    """Flag confirmed bookings past their check-out date as no_show (deposit
    forfeited), then best-effort notify each guest. Returns the flagged rows."""
    try:
        client = get_supabase_client()
        resp = client.rpc(
            "mark_expired_no_shows", {"p_grace_days": int(grace_days)}
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc

    flagged: list[dict[str, Any]] = []
    for row in resp.data or []:
        reservation_id = str(row.get("reservation_id") or "")
        guest_user_id = row.get("guest_user_id")
        reservation_code = str(row.get("reservation_code") or "")
        if not reservation_id:
            continue
        flagged.append(
            {
                "reservation_id": reservation_id,
                "reservation_code": reservation_code,
                "guest_user_id": str(guest_user_id) if guest_user_id else None,
            }
        )
        if guest_user_id:
            emit_notification(
                recipient_user_id=str(guest_user_id),
                category="reservation",
                event_type="reservation.no_show",
                title="Marked as no-show",
                body=(
                    f"Reservation {reservation_code} was marked as a no-show since "
                    "there was no check-in by the end of the stay. The deposit is "
                    "non-refundable per the booking policy."
                ),
                severity="warning",
                entity_type="reservation",
                entity_id=reservation_id,
                link="/my-bookings",
                dedupe_key=f"no_show:{reservation_id}",
            )
        emit_notification_to_roles(
            min_role="staff",
            category="reservation",
            event_type="ops.no_show",
            title="Guest no-show",
            body=(
                f"{reservation_code} was auto-marked a no-show (no check-in by "
                "checkout). Deposit forfeited; the unit/slot is now free."
            ),
            severity="warning",
            entity_type="reservation",
            entity_id=reservation_id,
            link="/admin/reservations",
            dedupe_prefix=f"ops_no_show:{reservation_id}",
        )
    return flagged


def cascade_service_bookings_no_show(*, reservation_id: str) -> None:
    """Best-effort: mark a reservation's non-terminal service bookings as no_show."""
    try:
        client = get_supabase_client()
        client.table("service_bookings").update({"status": "no_show"}).eq(
            "reservation_id", reservation_id
        ).not_.in_("status", ["cancelled", "no_show", "checked_in", "checked_out"]).execute()
    except Exception:  # noqa: BLE001 - cascade must never break the status change
        pass


def list_promos() -> list[dict[str, Any]]:
    try:
        client = get_supabase_client()
        resp = (
            client.table("promo_codes")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        return [_promo_row(r) for r in (resp.data or [])]
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def create_promo(*, actor_user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    code = str(payload.get("code") or "").strip()
    auto_apply = bool(payload.get("auto_apply", False))
    discount_type = str(payload.get("discount_type") or "").strip().lower()
    if not code and not auto_apply:
        raise ValueError("A promo code is required (or mark it as auto-apply).")
    if discount_type not in ("percent", "fixed"):
        raise ValueError("Discount type must be percent or fixed.")
    try:
        value = float(payload.get("discount_value"))
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Discount value must be a number.") from exc
    if value <= 0:
        raise ValueError("Discount value must be greater than zero.")
    if discount_type == "percent" and value > 100:
        raise ValueError("A percentage discount can't exceed 100%.")

    record = {
        "code": code or None,
        "description": payload.get("description"),
        "discount_type": discount_type,
        "discount_value": value,
        "max_discount": payload.get("max_discount"),
        "min_total": float(payload.get("min_total") or 0),
        "starts_at": payload.get("starts_at"),
        "ends_at": payload.get("ends_at"),
        "usage_limit": payload.get("usage_limit"),
        "per_user_limit": payload.get("per_user_limit"),
        "applies_to": str(payload.get("applies_to") or "stays"),
        "auto_apply": auto_apply,
        "is_active": bool(payload.get("is_active", True)),
        "created_by": actor_user_id,
    }
    try:
        client = get_supabase_client()
        resp = client.table("promo_codes").insert(record).execute()
        rows = resp.data or []
        if not rows:
            raise RuntimeError("The promo could not be created.")
        return _promo_row(rows[0])
    except (PermissionError, ValueError):
        raise
    except Exception as exc:  # noqa: BLE001
        message = str(getattr(exc, "message", None) or exc).lower()
        if any(token in message for token in ("duplicate", "unique", "already")):
            raise ValueError("A promo with this code already exists.") from exc
        raise _runtime_error_from_exception(exc) from exc


def update_promo(*, promo_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "description",
        "discount_type",
        "discount_value",
        "max_discount",
        "min_total",
        "starts_at",
        "ends_at",
        "usage_limit",
        "per_user_limit",
        "applies_to",
        "auto_apply",
        "is_active",
    }
    update = {k: v for k, v in patch.items() if k in allowed and v is not None}
    if "is_active" in patch:
        update["is_active"] = bool(patch["is_active"])
    if "auto_apply" in patch and patch["auto_apply"] is not None:
        update["auto_apply"] = bool(patch["auto_apply"])
    if not update:
        raise ValueError("Nothing to update.")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        client = get_supabase_client()
        client.table("promo_codes").update(update).eq("promo_id", promo_id).execute()
        resp = client.table("promo_codes").select("*").eq("promo_id", promo_id).limit(1).execute()
        rows = resp.data or []
        if not rows:
            raise ValueError("That promo no longer exists.")
        return _promo_row(rows[0])
    except (PermissionError, ValueError):
        raise
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc
