from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.core.auth import AuthContext
from app.main import app

client = TestClient(app)


def _admin_header() -> dict[str, str]:
    return {"Authorization": "Bearer admin-token"}


def _mock_admin_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="admin-user",
        email="admin@example.com",
        role="admin",
        access_token="admin-token",
    )


def _mock_guest_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="guest-user",
        email="guest@example.com",
        role="guest",
        access_token="guest-token",
    )


def _reservation_row(*, status: str = "confirmed") -> dict:
    return {
        "reservation_id": "res-1",
        "reservation_code": "HR-TEST-001",
        "status": status,
        "created_at": "2026-02-20T00:00:00+00:00",
        "check_in_date": "2026-02-21",
        "check_out_date": "2026-02-22",
        "total_amount": 1500,
    }


def test_reservations_list_passes_query_params(monkeypatch) -> None:
    captured: dict = {}

    def fake_list_recent_reservations(**kwargs):
        captured.update(kwargs)
        return ([_reservation_row(status="confirmed")], 1)

    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.list_recent_reservations",
        fake_list_recent_reservations,
    )

    response = client.get(
        "/v2/reservations?limit=10&offset=20&status=confirmed&search=hr-test&sort_by=created_at&sort_dir=desc",
        headers=_admin_header(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["limit"] == 10
    assert payload["offset"] == 20
    assert payload["has_more"] is False
    assert len(payload["items"]) == 1
    assert "x-api-latency-ms" in response.headers

    assert captured["limit"] == 10
    assert captured["offset"] == 20
    assert captured["status_filter"] == "confirmed"
    assert captured["search"] == "hr-test"
    assert captured["sort_by"] == "created_at"
    assert captured["sort_dir"] == "desc"


def test_cancel_reservation_blocks_non_owner(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_reservation_by_id",
        lambda _: {"reservation_id": "res-1", "guest_user_id": "another-user", "status": "pending_payment"},
    )

    response = client.post(
        "/v2/reservations/res-1/cancel",
        headers={"Authorization": "Bearer guest-token"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "You are not allowed to access this reservation."


def test_cancel_reservation_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_reservation_by_id",
        lambda _: {"reservation_id": "res-1", "guest_user_id": "guest-user", "status": "pending_payment"},
    )
    called: dict = {}

    def fake_cancel(**kwargs):
        called.update(kwargs)

    monkeypatch.setattr("app.api.v2.routes.reservations.cancel_reservation_rpc", fake_cancel)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.update_reservation_policy_metadata",
        lambda **_: None,
    )

    response = client.post(
        "/v2/reservations/res-1/cancel",
        headers={"Authorization": "Bearer guest-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["reservation_id"] == "res-1"
    assert payload["status"] == "cancelled"
    assert payload["paid_amount"] == 0
    assert payload["minimum_deposit"] == 0
    assert payload["refundable_amount"] == 0
    assert payload["non_refundable_amount"] == 0
    assert called["reservation_id"] == "res-1"


def test_patch_reservation_status_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)

    response = client.patch(
        "/v2/reservations/res-1/status",
        headers={"Authorization": "Bearer guest-token"},
        json={"status": "checked_in"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_patch_reservation_status_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_reservation_by_id",
        lambda _: {
            "reservation_id": "res-1",
            "reservation_code": "HR-TEST-001",
            "status": "confirmed",
            "created_at": "2026-02-20T00:00:00+00:00",
            "check_in_date": "2026-02-21",
            "check_out_date": "2026-02-22",
            "total_amount": 1500,
            "units": [],
            "service_bookings": [],
        },
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.update_reservation_status_rpc",
        lambda **_: {
            "reservation_id": "res-1",
            "reservation_code": "HR-TEST-001",
            "status": "checked_in",
            "created_at": "2026-02-20T00:00:00+00:00",
            "check_in_date": "2026-02-21",
            "check_out_date": "2026-02-22",
            "total_amount": 1500,
            "notes": "Manual update",
            "units": [],
            "service_bookings": [],
        },
    )

    response = client.patch(
        "/v2/reservations/res-1/status",
        headers={"Authorization": "Bearer admin-token"},
        json={"status": "checked_in", "notes": "Manual update"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["reservation"]["reservation_id"] == "res-1"
    assert payload["reservation"]["status"] == "checked_in"
    assert payload["reservation"]["notes"] == "Manual update"


def test_cancel_reservation_refunds_escrow_when_locked_for_admin_actor(monkeypatch) -> None:
    called: dict = {}

    class _FakeChain:
        key = "sepolia"
        chain_id = 11155111
        enabled = True
        rpc_url = "https://example-rpc"
        escrow_contract_address = "0xabc"
        signer_private_key = "0x123"

    class _FakeSettlement:
        tx_hash = "0xrefundhash"
        onchain_booking_id = "0xbooking"
        event_index = 5

    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_reservation_by_id",
        lambda _: {
            "reservation_id": "res-1",
            "guest_user_id": "another-user",
            "status": "pending_payment",
            "escrow_state": "locked",
            "chain_key": "sepolia",
            "onchain_booking_id": "0xbooking",
            "deposit_rule_applied": "room_cottage_20pct_clamp_500_1000",
        },
    )
    monkeypatch.setattr("app.api.v2.routes.reservations.cancel_reservation_rpc", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.reservations.settings.feature_escrow_onchain_lock", True)
    monkeypatch.setattr("app.api.v2.routes.reservations.get_chain_registry", lambda: {"sepolia": _FakeChain()})
    monkeypatch.setattr("app.api.v2.routes.reservations.get_active_chain", lambda: _FakeChain())
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.refund_reservation_escrow_onchain",
        lambda **_: _FakeSettlement(),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.write_reservation_escrow_shadow_metadata",
        lambda **kwargs: called.update(kwargs),
    )

    response = client.post(
        "/v2/reservations/res-1/cancel",
        headers=_admin_header(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["status"] == "cancelled"
    assert payload["cancellation_actor"] == "admin"
    assert payload["policy_outcome"] == "refunded"
    assert called["reservation_id"] == "res-1"
    assert called["tx_hash"] == "0xrefundhash"
    assert called["onchain_booking_id"] == "0xbooking"
    assert called["escrow_state"] == "refunded"
    assert called["escrow_event_index"] == 5


def test_cancel_reservation_guest_forfeits_and_skips_refund(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_reservation_by_id",
        lambda _: {
            "reservation_id": "res-1",
            "guest_user_id": "guest-user",
            "status": "pending_payment",
            "escrow_state": "locked",
            "chain_key": "sepolia",
            "onchain_booking_id": "0xbooking",
            "deposit_rule_applied": "room_cottage_20pct_clamp_500_1000",
        },
    )
    monkeypatch.setattr("app.api.v2.routes.reservations.cancel_reservation_rpc", lambda **_: None)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.update_reservation_policy_metadata",
        lambda **_: None,
    )
    monkeypatch.setattr("app.api.v2.routes.reservations.settings.feature_escrow_onchain_lock", True)

    def _should_not_refund(**_):
        raise AssertionError("Guest cancellation must not trigger escrow refund.")

    monkeypatch.setattr("app.api.v2.routes.reservations.refund_reservation_escrow_onchain", _should_not_refund)

    response = client.post(
        "/v2/reservations/res-1/cancel",
        headers={"Authorization": "Bearer guest-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "cancelled"
    assert payload["cancellation_actor"] == "guest"
    assert payload["policy_outcome"] == "forfeited"


def test_cancel_reservation_guest_response_includes_refundable_math(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_reservation_by_id",
        lambda _: {
            "reservation_id": "res-1",
            "guest_user_id": "guest-user",
            "status": "confirmed",
            "amount_paid_verified": 3000,
            "deposit_required": 1000,
            "escrow_state": "none",
            "deposit_rule_applied": "room_cottage_20pct_clamp_500_1000",
        },
    )
    monkeypatch.setattr("app.api.v2.routes.reservations.cancel_reservation_rpc", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.reservations.update_reservation_policy_metadata", lambda **_: None)

    response = client.post(
        "/v2/reservations/res-1/cancel",
        headers={"Authorization": "Bearer guest-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["cancellation_actor"] == "guest"
    assert payload["policy_outcome"] == "forfeited"
    assert payload["paid_amount"] == 3000
    assert payload["minimum_deposit"] == 1000
    assert payload["non_refundable_amount"] == 1000
    assert payload["refundable_amount"] == 2000


def test_create_tour_reservation_blocks_guest_same_day(monkeypatch) -> None:
    today = date.today().isoformat()
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_active_service_by_id_rpc",
        lambda _service_id: {"service_id": "svc-1", "adult_rate": 100, "kid_rate": 50},
    )

    response = client.post(
        "/v2/reservations/tours",
        headers={"Authorization": "Bearer guest-token"},
        json={
            "service_id": "svc-1",
            "visit_date": today,
            "adult_qty": 1,
            "kid_qty": 0,
            "is_advance": True,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "visit_date must be in the future."


def test_create_tour_reservation_blocks_guest_walk_in_mode(monkeypatch) -> None:
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_active_service_by_id_rpc",
        lambda _service_id: {"service_id": "svc-1", "adult_rate": 100, "kid_rate": 50},
    )

    response = client.post(
        "/v2/reservations/tours",
        headers={"Authorization": "Bearer guest-token"},
        json={
            "service_id": "svc-1",
            "visit_date": tomorrow,
            "adult_qty": 1,
            "kid_qty": 0,
            "is_advance": False,
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only resort staff can create walk-in tour reservations."


def test_create_tour_reservation_allows_admin_walk_in_same_day(monkeypatch) -> None:
    today = date.today().isoformat()
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_active_service_by_id_rpc",
        lambda _service_id: {"service_id": "svc-1", "adult_rate": 100, "kid_rate": 50},
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.create_tour_reservation_atomic_rpc",
        lambda **_: {
            "reservation_id": "res-tour-1",
            "reservation_code": "HR-TOUR-001",
            "status": "pending_payment",
        },
    )

    response = client.post(
        "/v2/reservations/tours",
        headers=_admin_header(),
        json={
            "service_id": "svc-1",
            "visit_date": today,
            "adult_qty": 2,
            "kid_qty": 1,
            "is_advance": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_id"] == "res-tour-1"
    assert payload["reservation_code"] == "HR-TOUR-001"
    assert payload["status"] == "pending_payment"


def test_create_reservation_blocks_admin_online_booking(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)

    response = client.post(
        "/v2/reservations",
        headers=_admin_header(),
        json={
            "check_in_date": "2026-02-21",
            "check_out_date": "2026-02-22",
            "unit_ids": ["unit-1"],
            "idempotency_key": "idem-admin-block-1",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin accounts cannot create online guest reservations. Use Walk-in flow."


def test_create_tour_reservation_blocks_admin_online_booking(monkeypatch) -> None:
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)

    response = client.post(
        "/v2/reservations/tours",
        headers=_admin_header(),
        json={
            "service_id": "svc-1",
            "visit_date": tomorrow,
            "adult_qty": 1,
            "kid_qty": 0,
            "is_advance": True,
            "idempotency_key": "idem-admin-block-2",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin accounts cannot create online guest reservations. Use Walk-in flow."


def test_create_reservation_contract_without_shadow(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    released: dict = {}

    def _fake_release_expired_holds(**kwargs):
        released.update(kwargs)
        return 1

    monkeypatch.setattr(
        "app.api.v2.routes.reservations.release_expired_pending_payment_holds",
        _fake_release_expired_holds,
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_available_units_rpc",
        lambda **_: [{"unit_id": "unit-1", "base_price": 1500}],
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.create_reservation_atomic_rpc",
        lambda **_: {
            "reservation_id": "res-1",
            "reservation_code": "HR-RES-001",
            "status": "pending_payment",
        },
    )
    monkeypatch.setattr("app.api.v2.routes.reservations.settings.feature_escrow_shadow_write", False)

    response = client.post(
        "/v2/reservations",
        headers={"Authorization": "Bearer guest-token"},
        json={
            "check_in_date": "2026-02-21",
            "check_out_date": "2026-02-22",
            "unit_ids": ["unit-1"],
            "idempotency_key": "idem-1",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_id"] == "res-1"
    assert payload["escrow_ref"] is None
    assert payload["deposit_policy_version"] == "v1_2026_04"
    assert payload["deposit_rule_applied"] == "room_cottage_20pct_clamp_500_1000"
    assert "older_than_utc" in released
    assert released["limit"] > 0


def test_create_reservation_does_not_lock_escrow_at_create(monkeypatch) -> None:
    """Escrow is locked only when an online deposit is *verified* (the PayMongo
    webhook) — never at create. A fresh reservation is an unpaid hold with no
    deposit to escrow, and cash/on-site bookings never touch the chain at all.
    The create path must not call the escrow writer or the on-chain lock even when
    both escrow feature flags are enabled."""
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_available_units_rpc",
        lambda **_: [{"unit_id": "unit-1", "base_price": 1500}],
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.create_reservation_atomic_rpc",
        lambda **_: {
            "reservation_id": "res-shadow-1",
            "reservation_code": "HR-RES-SHADOW-001",
            "status": "pending_payment",
        },
    )

    class _FakeChain:
        key = "sepolia"
        chain_id = 11155111
        rpc_url = "https://example-rpc"
        escrow_contract_address = "0xabc"
        signer_private_key = "0x123"
        enabled = True

    shadow_calls: list = []
    lock_calls: list = []

    # Both escrow flags ON — the create path must STILL not touch escrow.
    monkeypatch.setattr("app.api.v2.routes.reservations.settings.feature_escrow_shadow_write", True)
    monkeypatch.setattr("app.api.v2.routes.reservations.settings.feature_escrow_onchain_lock", True)
    monkeypatch.setattr("app.api.v2.routes.reservations.get_active_chain", lambda: _FakeChain())
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.lock_reservation_escrow_onchain",
        lambda **kwargs: lock_calls.append(kwargs),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.write_reservation_escrow_shadow_metadata",
        lambda **kwargs: shadow_calls.append(kwargs),
    )

    response = client.post(
        "/v2/reservations",
        headers={"Authorization": "Bearer guest-token"},
        json={
            "check_in_date": "2026-02-21",
            "check_out_date": "2026-02-22",
            "unit_ids": ["unit-1"],
            "idempotency_key": "idem-2",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_id"] == "res-shadow-1"
    assert payload["escrow_ref"] is None
    assert shadow_calls == []  # no shadow escrow record written at create
    assert lock_calls == []    # no on-chain escrow lock at create
    assert payload["deposit_policy_version"] == "v1_2026_04"
    assert payload["deposit_rule_applied"] == "room_cottage_20pct_clamp_500_1000"


def test_create_reservation_does_not_fail_when_ai_recommendation_errors(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_available_units_rpc",
        lambda **_: [{"unit_id": "unit-1", "base_price": 1500, "capacity": 2}],
    )
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.create_reservation_atomic_rpc",
        lambda **_: {
            "reservation_id": "res-ai-1",
            "reservation_code": "HR-RES-AI-001",
            "status": "pending_payment",
        },
    )
    monkeypatch.setattr("app.api.v2.routes.reservations.settings.feature_escrow_shadow_write", False)
    monkeypatch.setattr(
        "app.api.v2.routes.reservations.get_pricing_recommendation",
        lambda **_: (_ for _ in ()).throw(RuntimeError("AI down")),
    )

    response = client.post(
        "/v2/reservations",
        headers={"Authorization": "Bearer guest-token"},
        json={
            "check_in_date": "2026-02-21",
            "check_out_date": "2026-02-22",
            "unit_ids": ["unit-1"],
            "idempotency_key": "idem-ai-1",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_id"] == "res-ai-1"
    assert payload["ai_recommendation"] is None
