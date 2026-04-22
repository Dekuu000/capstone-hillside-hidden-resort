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
    amount_paid_verified,
    balance_due,
    guest_count,
    created_at,
    notes,
    guest_user_id,
    guest:users!guest_user_id(name,email,phone)
"""

RESERVATION_LIST_SELECT_LEGACY = """
    reservation_id,
    reservation_code,
    status,
    check_in_date,
    check_out_date,
    total_amount,
    amount_paid_verified,
    balance_due,
    guest_count,
    created_at,
    notes,
    guest_user_id,
    guest:users!guest_user_id(name,email,phone)
"""

RESERVATION_DETAIL_SELECT = """
    *,
    guest:users!guest_user_id(name,email,phone),
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
    description
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
    requested_at,
    processed_at,
    processed_by_user_id,
    updated_at,
    guest:users!guest_user_id(name,email,phone),
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
        deposit_policy_version,
        deposit_rule_applied,
        cancellation_actor,
        policy_outcome,
        guest:users!guest_user_id(name,email)
    )
"""

PAYMENT_SELECT_NO_POLICY = """
    *,
    reservation:reservations!inner(
        reservation_code,
        status,
        reservation_source,
        total_amount,
        deposit_required,
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
    guest_count,
    units:reservation_units(
        reservation_unit_id,
        quantity_or_nights,
        rate_snapshot,
        unit:units(name,unit_code,room_number,type)
    ),
    service_bookings:service_bookings(
        service_booking_id,
        visit_date,
        total_amount,
        adult_qty,
        kid_qty,
        service:services(service_name)
    )
"""

PAYMENT_SELECT_LEGACY = """
    *,
    reservation:reservations!inner(
        reservation_code,
        status,
        total_amount,
        deposit_required,
        guest:users!guest_user_id(name,email)
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
            guest:users!guest_user_id(name,email,phone),
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


def _is_missing_column_error(exc: Exception, column_name: str) -> bool:
    message = str(exc).lower()
    return "column" in message and column_name.lower() in message and "does not exist" in message


def _run_select_with_missing_column_fallbacks(
    *,
    primary_select: str,
    run_select,
    missing_column_fallbacks: list[tuple[str, str]],
) -> tuple[list[dict[str, Any]], int]:
    try:
        return run_select(primary_select)
    except Exception as exc:  # noqa: BLE001
        current_error: Exception = exc
        for missing_column, fallback_select in missing_column_fallbacks:
            if not _is_missing_column_error(current_error, missing_column):
                continue
            try:
                return run_select(fallback_select)
            except Exception as nested_exc:  # noqa: BLE001
                current_error = nested_exc
        raise _runtime_error_from_exception(current_error) from current_error


def _infer_reservation_source(row: dict[str, Any]) -> str:
    explicit = str(row.get("reservation_source") or "").lower()
    if explicit in {"online", "walk_in"}:
        return explicit
    notes = str(row.get("notes") or "").lower()
    if "walk-in" in notes or "walk in" in notes:
        return "walk_in"
    return "online"


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

    def _run(select_clause: str, supports_source_filter: bool) -> tuple[list[dict[str, Any]], int]:
        base_query = (
            client.table("reservations")
            .select(select_clause, count="exact")
            .order(sort_column, desc=descending)
            .order("reservation_id", desc=descending)
        )
        effective_source_filter = source_filter if supports_source_filter else None
        base_query = _apply_reservation_filters(base_query, status_filter, effective_source_filter)

        if not search_term:
            if source_filter in {"online", "walk_in"} and not supports_source_filter:
                full_response = _timed_execute(
                    "db.reservations.list_recent.fallback_scan",
                    lambda: base_query.range(0, 999).execute(),
                )
                all_rows = [_normalize_reservation_row(row) for row in (full_response.data or [])]
                filtered_rows = [row for row in all_rows if _infer_reservation_source(row) == source_filter]
                return filtered_rows[offset : offset + limit], len(filtered_rows)

            response = _timed_execute(
                "db.reservations.list_recent.page",
                lambda: base_query.range(offset, offset + limit - 1).execute(),
            )
            rows = [_normalize_reservation_row(row) for row in (response.data or [])]
            return rows, int(response.count or 0)

        full_response = _timed_execute(
            "db.reservations.list_recent.search_scan",
            lambda: base_query.range(0, 999).execute(),
        )
        rows = full_response.data or []
        filtered_rows = [_normalize_reservation_row(row) for row in rows if _matches_search(row, search_term)]
        if source_filter in {"online", "walk_in"} and not supports_source_filter:
            filtered_rows = [row for row in filtered_rows if _infer_reservation_source(row) == source_filter]
        return filtered_rows[offset : offset + limit], len(filtered_rows)

    def _run_reservation_select(select_clause: str) -> tuple[list[dict[str, Any]], int]:
        supports_source_filter = select_clause != RESERVATION_LIST_SELECT_LEGACY
        return _run(select_clause, supports_source_filter)

    return _run_select_with_missing_column_fallbacks(
        primary_select=RESERVATION_LIST_SELECT,
        run_select=_run_reservation_select,
        missing_column_fallbacks=[
            ("reservation_source", RESERVATION_LIST_SELECT_LEGACY),
        ],
    )


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
        return _attach_admin_users(paginated), total

    return _run_select_with_missing_column_fallbacks(
        primary_select=PAYMENT_SELECT,
        run_select=_run,
        missing_column_fallbacks=[
            ("deposit_policy_version", PAYMENT_SELECT_NO_POLICY),
            ("reservation_source", PAYMENT_SELECT_LEGACY),
        ],
    )


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
        if role != "admin":
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
