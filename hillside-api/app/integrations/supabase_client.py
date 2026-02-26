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
    check_in_date,
    check_out_date,
    total_amount,
    amount_paid_verified,
    balance_due,
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
    created_at,
    notes
"""

PAYMENT_SELECT = """
    *,
    reservation:reservations!inner(
        reservation_code,
        status,
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
    expected_pay_now,
    units:reservation_units(
        reservation_unit_id,
        quantity_or_nights,
        rate_snapshot,
        unit:units(name)
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
    type,
    description,
    base_price,
    capacity,
    is_active,
    image_url,
    image_urls,
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
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def _normalize_sort_column(sort_by: str | None) -> str:
    allowed = {"created_at", "check_in_date", "check_out_date", "reservation_code", "total_amount"}
    if sort_by in allowed:
        return sort_by
    return "created_at"


def _apply_reservation_filters(query, status_filter: str | None):
    if status_filter:
        query = query.eq("status", status_filter)
    return query


def _matches_search(row: dict[str, Any], search_term: str) -> bool:
    guest = row.get("guest") or {}
    haystacks = [
        str(row.get("reservation_code") or "").lower(),
        str(guest.get("name") or "").lower(),
        str(guest.get("email") or "").lower(),
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
    search: str | None = None,
    sort_by: str | None = None,
    sort_dir: str = "desc",
) -> tuple[list[dict[str, Any]], int]:
    client = get_supabase_client()
    sort_column = _normalize_sort_column(sort_by)
    descending = str(sort_dir).lower() != "asc"

    base_query = (
        client.table("reservations")
        .select(RESERVATION_LIST_SELECT, count="exact")
        .order(sort_column, desc=descending)
        .order("reservation_id", desc=descending)
    )
    base_query = _apply_reservation_filters(base_query, status_filter)

    search_term = (search or "").strip().lower()
    if not search_term:
        response = _timed_execute(
            "db.reservations.list_recent.page",
            lambda: base_query.range(offset, offset + limit - 1).execute(),
        )
        rows = [_normalize_reservation_row(row) for row in (response.data or [])]
        return rows, int(response.count or 0)

    # Fallback search path for parity across reservation_code + guest fields.
    # This keeps API behavior correct while we migrate to a dedicated indexed search path.
    full_response = _timed_execute(
        "db.reservations.list_recent.search_scan",
        lambda: base_query.range(0, 999).execute(),
    )
    rows = full_response.data or []
    filtered_rows = [_normalize_reservation_row(row) for row in rows if _matches_search(row, search_term)]
    return filtered_rows[offset : offset + limit], len(filtered_rows)


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
            .in_("escrow_state", ["pending_lock", "locked", "released", "refunded", "failed"])
            .order("created_at", desc=True)
        )
        response = _timed_execute(
            "db.escrow.reconciliation.page",
            lambda: query.range(offset, offset + limit - 1).execute(),
        )
        return response.data or [], int(response.count or 0)
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


def list_admin_payments(
    *,
    tab: str = "to_review",
    limit: int = 10,
    offset: int = 0,
    search: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    client = get_supabase_client()
    query = (
        client.table("payments")
        .select(PAYMENT_SELECT, count="exact")
        .order("created_at", desc=True)
    )

    if tab == "to_review":
        query = query.eq("status", "pending")
    elif tab == "verified":
        query = query.eq("status", "verified")
    elif tab == "rejected":
        query = query.eq("status", "rejected")

    search_term = (search or "").strip().lower()
    scan_required = bool(search_term) or tab == "to_review"
    if scan_required:
        scan_limit = min(1000, max(limit + offset, 200))
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
            if canonical_booking_status((row.get("reservation") or {}).get("status")) == "for_verification"
            and canonical_booking_status((row.get("reservation") or {}).get("status")) not in {"cancelled", "no_show"}
            and bool(row.get("proof_url") or row.get("reference_no"))
        ]

    if search_term:
        rows = [row for row in rows if _matches_payment_search(row, search_term)]

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
        client.table("units").update({"is_active": False}).eq("unit_id", unit_id).execute()
        response = client.table("units").select("unit_id,is_active").eq("unit_id", unit_id).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc


def update_unit_status(*, unit_id: str, is_active: bool) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()
        client.table("units").update({"is_active": is_active}).eq("unit_id", unit_id).execute()
        response = client.table("units").select(UNIT_LIST_SELECT).eq("unit_id", unit_id).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None
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
            .select("check_in_date,status")
            .gte("check_in_date", since)
            .order("check_in_date", desc=False)
            .execute()
        )
        rows = response.data or []

        counts_by_day: dict[str, int] = {}
        for row in rows:
            status_text = canonical_booking_status(row.get("status"))
            if status_text in {"cancelled", "no_show"}:
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
) -> dict[str, Any] | None:
    try:
        client = get_supabase_client()

        # Update first (this client version does not support .select() after .update().eq()).
        client.table("reservations").update(
            {
                "escrow_state": escrow_state,
                "chain_key": chain_key,
                "chain_id": chain_id,
                "escrow_contract_address": contract_address,
                "chain_tx_hash": tx_hash,
                "onchain_booking_id": onchain_booking_id,
                "escrow_event_index": escrow_event_index,
            }
        ).eq("reservation_id", reservation_id).execute()

        # Read-back for response/debug.
        response = (
            client.table("reservations")
            .select(
                "reservation_id,escrow_state,chain_key,chain_id,"
                "escrow_contract_address,chain_tx_hash,onchain_booking_id,escrow_event_index"
            )
            .eq("reservation_id", reservation_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        raise _runtime_error_from_exception(exc) from exc
