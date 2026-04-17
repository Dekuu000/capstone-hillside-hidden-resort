from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthContext, require_authenticated
from app.core.config import settings
from app.integrations.supabase_client import (
    cleanup_sync_operation_receipts,
    create_reservation_atomic as create_reservation_atomic_rpc,
    create_resort_service_request,
    create_tour_reservation_atomic as create_tour_reservation_atomic_rpc,
    get_active_service_by_id as get_active_service_by_id_rpc,
    get_available_units as get_available_units_rpc,
    get_reservation_by_code as get_reservation_by_code_rpc,
    get_reservation_by_id as get_reservation_by_id_rpc,
    get_sync_operation_receipt,
    list_guest_reservation_ids,
    list_reservation_unit_ids,
    list_sync_change_events,
    perform_checkin as perform_checkin_rpc,
    perform_checkout as perform_checkout_rpc,
    reject_payment as reject_payment_rpc,
    record_on_site_payment as record_on_site_payment_rpc,
    submit_payment_proof as submit_payment_proof_rpc,
    update_resort_service_request_status,
    update_reservation_source as update_reservation_source_rpc,
    update_units_operational_status,
    verify_payment as verify_payment_rpc,
    upsert_sync_operation_receipt,
    upsert_sync_upload_item,
)
from app.schemas.common import (
    OfflineOperation,
    SyncConflict,
    SyncPullEvent,
    SyncPushItemResult,
    SyncPushRequest,
    SyncPushResult,
    SyncStateSnapshot,
    SyncUploadsCommitRequest,
    SyncUploadsCommitResponse,
    UploadQueueItem,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _parse_iso_date(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:  # noqa: B904
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}. Expected YYYY-MM-DD.",
        ) from exc


def _is_conflict_message(message: str) -> bool:
    lowered = message.lower()
    markers = [
        "already",
        "conflict",
        "not allowed",
        "not available",
        "blocked",
        "cannot",
        "must be settled",
    ]
    return any(marker in lowered for marker in markers)


def _looks_like_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, TypeError):
        return False


def _resolve_reservation_id(raw_value: str) -> str:
    candidate = raw_value.strip()
    if not candidate:
        raise RuntimeError("reservation_id is required.")
    if _looks_like_uuid(candidate):
        return candidate
    row = get_reservation_by_code_rpc(candidate)
    reservation_id = str((row or {}).get("reservation_id") or "").strip()
    if not reservation_id:
        raise RuntimeError("Reservation not found.")
    return reservation_id


def _receipt_to_push_result(receipt: dict[str, Any]) -> SyncPushItemResult:
    conflict = SyncConflict(
        conflict=bool(receipt.get("conflict")),
        server_version=receipt.get("server_version"),
        resolution_hint=receipt.get("resolution_hint"),
        detail=receipt.get("error_message"),
    )
    return SyncPushItemResult(
        operation_id=str(receipt.get("operation_id") or ""),
        idempotency_key=str(receipt.get("idempotency_key") or ""),
        entity_type=str(receipt.get("entity_type") or ""),
        action=str(receipt.get("action") or ""),
        status=str(receipt.get("status") or "failed"),  # type: ignore[arg-type]
        http_status=int(receipt.get("http_status") or 200),
        entity_id=receipt.get("entity_id"),
        conflict=conflict if conflict.conflict else None,
        response_payload=receipt.get("response_payload") or {},
        error_code=receipt.get("error_code"),
        error_message=receipt.get("error_message"),
    )


def _apply_reservation_create(op: OfflineOperation, auth: AuthContext) -> tuple[str | None, dict[str, Any]]:
    payload = op.payload
    action_key = op.action.strip().lower()
    is_walk_in = action_key in {"reservations.walk_in.create", "reservations.walkin.create"} or str(
        payload.get("reservation_source") or ""
    ).strip().lower() in {"walk_in", "walk-in", "walkin"}
    check_in = _parse_iso_date(str(payload.get("check_in_date") or ""), "check_in_date")
    check_out = _parse_iso_date(str(payload.get("check_out_date") or ""), "check_out_date")
    if check_out <= check_in:
        raise RuntimeError("check_out_date must be after check_in_date.")
    if is_walk_in and auth.role != "admin":
        raise RuntimeError("Admin access required for walk-in reservation.")
    if is_walk_in and check_in < date.today():
        raise RuntimeError("check_in_date cannot be in the past.")
    unit_ids = [str(unit_id) for unit_id in (payload.get("unit_ids") or []) if str(unit_id).strip()]
    if not unit_ids:
        raise RuntimeError("At least one unit_id is required.")
    guest_count = int(payload.get("guest_count") or 1)
    guest_name = str(payload.get("guest_name") or "").strip() or None
    guest_phone = str(payload.get("guest_phone") or "").strip() or None
    raw_notes = str(payload.get("notes") or "").strip() or None
    expected_pay_now_raw = payload.get("expected_pay_now")
    expected_pay_now = float(expected_pay_now_raw) if expected_pay_now_raw is not None else None
    notes = raw_notes
    if is_walk_in:
        notes_parts = [
            "Walk-in stay booking (offline sync).",
            f"Guest: {guest_name}" if guest_name else None,
            f"Phone: {guest_phone}" if guest_phone else None,
            raw_notes,
        ]
        notes = " | ".join(part for part in notes_parts if part)

    available_units = get_available_units_rpc(
        check_in_date=check_in.isoformat(),
        check_out_date=check_out.isoformat(),
        unit_type=None,
    )
    unit_map = {str(unit.get("unit_id")): unit for unit in available_units}
    missing = [unit_id for unit_id in unit_ids if unit_id not in unit_map]
    if missing:
        raise RuntimeError("One or more selected units are no longer available.")

    nights = (check_out - check_in).days
    rates: list[float] = []
    total_amount = 0.0
    for unit_id in unit_ids:
        base_price = float(unit_map[unit_id].get("base_price") or 0)
        rates.append(base_price)
        total_amount += base_price * nights

    created = create_reservation_atomic_rpc(
        access_token=auth.access_token,
        guest_user_id=auth.user_id,
        check_in_date=check_in.isoformat(),
        check_out_date=check_out.isoformat(),
        unit_ids=unit_ids,
        rates=rates,
        total_amount=total_amount,
        guest_count=guest_count,
        expected_pay_now=expected_pay_now,
        notes=notes,
    )
    reservation_id = str(created.get("reservation_id") or "")
    if reservation_id:
        update_reservation_source_rpc(
            reservation_id=reservation_id,
            reservation_source="walk_in" if is_walk_in else "online",
        )
    return reservation_id or None, created


def _apply_tour_reservation_create(op: OfflineOperation, auth: AuthContext) -> tuple[str | None, dict[str, Any]]:
    payload = op.payload
    service_id = str(payload.get("service_id") or "").strip()
    if not service_id:
        raise RuntimeError("service_id is required.")
    visit_date = _parse_iso_date(str(payload.get("visit_date") or ""), "visit_date")
    adult_qty = int(payload.get("adult_qty") or 0)
    kid_qty = int(payload.get("kid_qty") or 0)
    if adult_qty + kid_qty <= 0:
        raise RuntimeError("At least one guest is required.")
    is_advance = bool(payload.get("is_advance", True))
    notes = str(payload.get("notes") or "").strip() or None
    expected_pay_now_raw = payload.get("expected_pay_now")
    expected_pay_now = float(expected_pay_now_raw) if expected_pay_now_raw is not None else None

    service = get_active_service_by_id_rpc(service_id)
    if not service:
        raise RuntimeError("Service not found or inactive.")

    created = create_tour_reservation_atomic_rpc(
        access_token=auth.access_token,
        guest_user_id=auth.user_id,
        service_id=service_id,
        visit_date=visit_date.isoformat(),
        adult_qty=adult_qty,
        kid_qty=kid_qty,
        is_advance=is_advance,
        expected_pay_now=expected_pay_now,
        notes=notes,
    )
    reservation_id = str(created.get("reservation_id") or "")
    source_value = "walk_in" if auth.role == "admin" and not is_advance else "online"
    if reservation_id:
        update_reservation_source_rpc(reservation_id=reservation_id, reservation_source=source_value)
    return reservation_id or None, created


def _apply_payment_submission(op: OfflineOperation, auth: AuthContext) -> tuple[str | None, dict[str, Any]]:
    payload = op.payload
    action_key = op.action.strip().lower()
    if action_key in {"payments.verify", "admin.payments.verify"}:
        if auth.role != "admin":
            raise RuntimeError("Admin access required for payment verification.")
        payment_id = str(payload.get("payment_id") or op.entity_id or "").strip()
        if not payment_id:
            raise RuntimeError("payment_id is required.")
        verify_payment_rpc(payment_id=payment_id, access_token=auth.access_token, approved=True)
        return payment_id, {"ok": True, "payment_id": payment_id, "status": "verified"}

    if action_key in {"payments.reject", "admin.payments.reject"}:
        if auth.role != "admin":
            raise RuntimeError("Admin access required for payment rejection.")
        payment_id = str(payload.get("payment_id") or op.entity_id or "").strip()
        if not payment_id:
            raise RuntimeError("payment_id is required.")
        reason = str(payload.get("reason") or "").strip()
        if len(reason) < 5:
            raise RuntimeError("Reason must be at least 5 characters.")
        reject_payment_rpc(payment_id=payment_id, access_token=auth.access_token, reason=reason)
        return payment_id, {"ok": True, "payment_id": payment_id, "status": "rejected", "reason": reason}

    reservation_id = _resolve_reservation_id(str(payload.get("reservation_id") or payload.get("reservation_code") or ""))
    amount = float(payload.get("amount") or 0)
    if amount <= 0:
        raise RuntimeError("amount must be greater than zero.")
    method = str(payload.get("method") or "").strip() or "gcash"
    reference_no = str(payload.get("reference_no") or "").strip() or None
    if action_key in {"payments.on_site.create", "admin.payments.on_site.create"}:
        if auth.role != "admin":
            raise RuntimeError("Admin access required for on-site payment.")
        result = record_on_site_payment_rpc(
            access_token=auth.access_token,
            reservation_id=reservation_id,
            amount=amount,
            method=method,
            reference_no=reference_no,
        )
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
        reservation_row = get_reservation_by_id_rpc(reservation_id) or {}
        next_status = str(reservation_row.get("status") or "confirmed")
        return payment_id, {
            "ok": True,
            "payment_id": payment_id,
            "status": payment_status,
            "reservation_status": next_status,
            "reservation_id": reservation_id,
        }

    payment_type = str(payload.get("payment_type") or "").strip() or "deposit"
    proof_url = str(payload.get("proof_url") or "").strip()
    if not proof_url:
        raise RuntimeError("proof_url is required.")
    result = submit_payment_proof_rpc(
        access_token=auth.access_token,
        reservation_id=reservation_id,
        payment_type=payment_type,
        amount=amount,
        method=method,
        reference_no=reference_no,
        proof_url=proof_url,
    )
    payment_id = None
    if isinstance(result, str):
        payment_id = result
    elif isinstance(result, list) and result:
        payment_id = str(result[0])
    return payment_id, {"payment_id": payment_id, "status": "pending", "reservation_id": reservation_id}


def _apply_checkin(op: OfflineOperation, auth: AuthContext) -> tuple[str | None, dict[str, Any]]:
    if auth.role != "admin":
        raise RuntimeError("Admin access required for check-in.")
    payload = op.payload
    reservation_id = str(payload.get("reservation_id") or "").strip()
    if not reservation_id:
        raise RuntimeError("reservation_id is required.")
    override_reason = str(payload.get("override_reason") or "").strip() or None
    perform_checkin_rpc(
        access_token=auth.access_token,
        reservation_id=reservation_id,
        override_reason=override_reason,
    )
    unit_ids = list_reservation_unit_ids(reservation_id=reservation_id)
    update_units_operational_status(unit_ids=unit_ids, operational_status="occupied")
    return reservation_id, {"reservation_id": reservation_id, "status": "checked_in"}


def _apply_checkout(op: OfflineOperation, auth: AuthContext) -> tuple[str | None, dict[str, Any]]:
    if auth.role != "admin":
        raise RuntimeError("Admin access required for check-out.")
    payload = op.payload
    reservation_id = str(payload.get("reservation_id") or "").strip()
    if not reservation_id:
        raise RuntimeError("reservation_id is required.")
    perform_checkout_rpc(access_token=auth.access_token, reservation_id=reservation_id)
    unit_ids = list_reservation_unit_ids(reservation_id=reservation_id)
    update_units_operational_status(unit_ids=unit_ids, operational_status="dirty")
    return reservation_id, {"reservation_id": reservation_id, "status": "checked_out"}


def _apply_service_request(op: OfflineOperation, auth: AuthContext) -> tuple[str | None, dict[str, Any]]:
    payload = op.payload
    action_key = op.action.strip().lower()
    if action_key in {"admin.services.requests.update_status", "service_request.update_status"}:
        if auth.role != "admin":
            raise RuntimeError("Admin access required for service request updates.")
        request_id = str(payload.get("request_id") or "").strip()
        next_status = str(payload.get("status") or "").strip()
        if not request_id:
            raise RuntimeError("request_id is required.")
        if next_status not in {"new", "in_progress", "done", "cancelled"}:
            raise RuntimeError("status is invalid.")
        notes = str(payload.get("notes") or "").strip() or None
        updated = update_resort_service_request_status(
            access_token=auth.access_token,
            request_id=request_id,
            status=next_status,
            processed_by_user_id=auth.user_id,
            notes=notes,
        )
        if not updated:
            raise RuntimeError("Service request not found.")
        return request_id, updated

    service_item_id = str(payload.get("service_item_id") or "").strip()
    if not service_item_id:
        raise RuntimeError("service_item_id is required.")
    request_row = create_resort_service_request(
        access_token=auth.access_token,
        guest_user_id=auth.user_id,
        service_item_id=service_item_id,
        reservation_id=str(payload.get("reservation_id") or "").strip() or None,
        quantity=max(1, int(payload.get("quantity") or 1)),
        preferred_time=str(payload.get("preferred_time") or "").strip() or None,
        notes=str(payload.get("notes") or "").strip() or None,
    )
    if not request_row:
        raise RuntimeError("Failed to create service request.")
    request_id = str(request_row.get("request_id") or "")
    return request_id or None, request_row


def _apply_operation(op: OfflineOperation, auth: AuthContext) -> tuple[str | None, dict[str, Any]]:
    if op.entity_type == "reservation":
        return _apply_reservation_create(op, auth)
    if op.entity_type == "tour_reservation":
        return _apply_tour_reservation_create(op, auth)
    if op.entity_type == "payment_submission":
        return _apply_payment_submission(op, auth)
    if op.entity_type == "checkin":
        return _apply_checkin(op, auth)
    if op.entity_type == "checkout":
        return _apply_checkout(op, auth)
    if op.entity_type == "service_request":
        return _apply_service_request(op, auth)
    raise RuntimeError(f"Unsupported operation entity_type '{op.entity_type}'.")


def _filter_pull_event_for_scope(
    event: dict[str, Any],
    *,
    auth: AuthContext,
    owned_reservation_ids: set[str],
) -> bool:
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    entity_type = str(event.get("entity_type") or "")
    if entity_type == "reservations":
        owner_id = str(payload.get("guest_user_id") or "")
        return owner_id == auth.user_id or str(event.get("entity_id") or "") in owned_reservation_ids
    if entity_type in {"payments", "checkin_logs"}:
        reservation_id = str(payload.get("reservation_id") or "")
        return reservation_id in owned_reservation_ids
    if entity_type == "resort_service_requests":
        return str(payload.get("guest_user_id") or "") == auth.user_id
    return False


@router.get("/sync/pull", response_model=SyncStateSnapshot)
def sync_pull(
    cursor: int = Query(default=0, ge=0),
    scope: Literal["me", "admin"] = Query(default="me"),
    limit: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_authenticated),
):
    if not settings.feature_offline_sync:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Offline sync feature is disabled.",
        )
    if scope == "admin" and auth.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin scope requires admin access.")

    effective_limit = limit or settings.sync_pull_default_limit
    effective_limit = max(1, min(effective_limit, settings.sync_pull_max_limit))

    try:
        events = list_sync_change_events(cursor=cursor, limit=effective_limit)
        scanned_cursor = max((int(row.get("cursor") or cursor) for row in events), default=cursor)
        if scope == "admin":
            filtered = events
        else:
            owned_reservations = list_guest_reservation_ids(user_id=auth.user_id)
            filtered = [
                row
                for row in events
                if _filter_pull_event_for_scope(row, auth=auth, owned_reservation_ids=owned_reservations)
            ]
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    items = [
        SyncPullEvent(
            cursor=int(row.get("cursor") or 0),
            entity_type=str(row.get("entity_type") or ""),
            entity_id=str(row.get("entity_id") or ""),
            action=str(row.get("action") or "update"),  # type: ignore[arg-type]
            version=int(row.get("version") or 0),
            changed_at=row.get("changed_at"),
            payload=row.get("payload") if isinstance(row.get("payload"), dict) else {},
        )
        for row in filtered
    ]

    return SyncStateSnapshot(
        scope=scope,
        cursor=cursor,
        next_cursor=scanned_cursor,
        count=len(items),
        has_more=len(events) >= effective_limit,
        items=items,
        as_of=datetime.now(timezone.utc),
    )


@router.post("/sync/push", response_model=SyncPushResult)
def sync_push(
    payload: SyncPushRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    if not settings.feature_offline_sync:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Offline sync feature is disabled.",
        )

    operations = payload.operations
    max_batch = max(1, settings.sync_push_max_batch_size)
    if len(operations) > max_batch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Max sync push batch size is {max_batch}.",
        )

    sorted_operations = sorted(operations, key=lambda op: op.created_at)
    item_results: list[SyncPushItemResult] = []

    for op in sorted_operations:
        try:
            existing = get_sync_operation_receipt(
                operation_id=op.operation_id,
                user_id=auth.user_id,
                idempotency_key=op.idempotency_key,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

        if existing:
            item_results.append(_receipt_to_push_result(existing))
            continue

        try:
            entity_id, response_payload = _apply_operation(op, auth)
            receipt = upsert_sync_operation_receipt(
                operation_id=op.operation_id,
                idempotency_key=op.idempotency_key,
                user_id=auth.user_id,
                entity_type=op.entity_type,
                entity_id=entity_id,
                action=op.action,
                status="applied",
                http_status=200,
                response_payload=response_payload,
                metadata={"retry_count": op.retry_count},
            )
            item_results.append(
                _receipt_to_push_result(
                    receipt
                    or {
                        "operation_id": op.operation_id,
                        "idempotency_key": op.idempotency_key,
                        "entity_type": op.entity_type,
                        "action": op.action,
                        "status": "applied",
                        "http_status": 200,
                        "entity_id": entity_id,
                        "response_payload": response_payload,
                    }
                )
            )
        except RuntimeError as exc:
            message = str(exc)
            is_conflict = _is_conflict_message(message)
            status_text = "conflict" if is_conflict else "failed"
            receipt = upsert_sync_operation_receipt(
                operation_id=op.operation_id,
                idempotency_key=op.idempotency_key,
                user_id=auth.user_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                action=op.action,
                status=status_text,
                http_status=409 if is_conflict else 400,
                conflict=is_conflict,
                resolution_hint="server_wins_refresh_required" if is_conflict else "retry_with_valid_payload",
                error_code="sync_operation_failed",
                error_message=message[:500],
                response_payload={},
                metadata={"retry_count": op.retry_count},
            )
            item_results.append(
                _receipt_to_push_result(
                    receipt
                    or {
                        "operation_id": op.operation_id,
                        "idempotency_key": op.idempotency_key,
                        "entity_type": op.entity_type,
                        "action": op.action,
                        "status": status_text,
                        "http_status": 409 if is_conflict else 400,
                        "conflict": is_conflict,
                        "resolution_hint": "server_wins_refresh_required" if is_conflict else "retry_with_valid_payload",
                        "error_code": "sync_operation_failed",
                        "error_message": message[:500],
                        "response_payload": {},
                    }
                )
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Unexpected sync push failure operation_id=%s", op.operation_id)
            receipt = upsert_sync_operation_receipt(
                operation_id=op.operation_id,
                idempotency_key=op.idempotency_key,
                user_id=auth.user_id,
                entity_type=op.entity_type,
                entity_id=op.entity_id,
                action=op.action,
                status="failed",
                http_status=500,
                conflict=False,
                resolution_hint="retry_later",
                error_code="sync_internal_error",
                error_message=str(exc)[:500],
                response_payload={},
                metadata={"retry_count": op.retry_count},
            )
            item_results.append(
                _receipt_to_push_result(
                    receipt
                    or {
                        "operation_id": op.operation_id,
                        "idempotency_key": op.idempotency_key,
                        "entity_type": op.entity_type,
                        "action": op.action,
                        "status": "failed",
                        "http_status": 500,
                        "conflict": False,
                        "resolution_hint": "retry_later",
                        "error_code": "sync_internal_error",
                        "error_message": str(exc)[:500],
                        "response_payload": {},
                    }
                )
            )

    try:
        cleanup_sync_operation_receipts(retention_hours=settings.sync_idempotency_retention_hours)
    except RuntimeError:
        logger.exception("Failed to cleanup sync operation receipts.")

    applied = sum(1 for result in item_results if result.status == "applied")
    conflict = sum(1 for result in item_results if result.status == "conflict")
    failed = sum(1 for result in item_results if result.status == "failed")
    noop = sum(1 for result in item_results if result.status == "noop")

    return SyncPushResult(
        accepted=len(item_results),
        applied=applied,
        failed=failed,
        conflict=conflict,
        noop=noop,
        results=item_results,
        as_of=datetime.now(timezone.utc),
    )


@router.post("/sync/uploads/commit", response_model=SyncUploadsCommitResponse)
def sync_uploads_commit(
    payload: SyncUploadsCommitRequest,
    auth: AuthContext = Depends(require_authenticated),
):
    if not settings.feature_offline_sync:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Offline sync feature is disabled.",
        )

    committed_items: list[UploadQueueItem] = []
    failed_items: list[UploadQueueItem] = []
    for item in payload.items:
        try:
            row = upsert_sync_upload_item(
                upload_id=item.upload_id,
                operation_id=item.operation_id,
                user_id=auth.user_id,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                field_name=item.field_name,
                storage_bucket=item.storage_bucket,
                storage_path=item.storage_path,
                mime_type=item.mime_type,
                size_bytes=item.size_bytes,
                checksum_sha256=item.checksum_sha256,
                status="committed",
                failure_reason=None,
                metadata=item.metadata,
            )
            merged = dict(item.model_dump())
            if isinstance(row, dict):
                merged.update(row)
            committed_items.append(UploadQueueItem(**merged))
        except RuntimeError as exc:
            failed_items.append(
                UploadQueueItem(
                    **{
                        **item.model_dump(),
                        "status": "failed",
                        "failure_reason": str(exc),
                    }
                )
            )

    return SyncUploadsCommitResponse(
        committed=len(committed_items),
        failed=len(failed_items),
        items=[*committed_items, *failed_items],
    )
