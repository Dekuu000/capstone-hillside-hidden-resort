from fastapi.testclient import TestClient

from app.core.auth import AuthContext
from app.main import app

client = TestClient(app)


def _admin_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="admin-user",
        email="admin@example.com",
        role="admin",
        access_token="admin-token",
    )


def _header() -> dict[str, str]:
    return {"Authorization": "Bearer admin-token"}


def test_qr_to_checkin_to_checkout_happy_path(monkeypatch) -> None:
    calls: dict[str, str | None] = {}

    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.qr.validate_qr_checkin",
        lambda **_: {
            "reservation_id": "res-1",
            "reservation_code": "HR-TEST-001",
            "status": "confirmed",
            "allowed": True,
            "can_override": False,
            "reason": None,
            "guest_name": "Guest One",
            "check_in_date": "2026-02-19",
            "check_out_date": "2026-02-20",
        },
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.perform_checkin_rpc",
        lambda **kwargs: calls.update(
            {"checkin_reservation_id": kwargs.get("reservation_id"), "override_reason": kwargs.get("override_reason")}
        ),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.perform_checkout_rpc",
        lambda **kwargs: calls.update({"checkout_reservation_id": kwargs.get("reservation_id")}),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.get_reservation_by_id",
        lambda _reservation_id: {
            "reservation_id": "res-1",
            "escrow_state": "none",
        },
    )

    qr_res = client.post(
        "/v2/qr/verify",
        json={"reservation_code": "HR-TEST-001", "scanner_id": "scanner-1"},
        headers=_header(),
    )
    assert qr_res.status_code == 200
    qr_payload = qr_res.json()
    assert qr_payload["allowed"] is True
    assert qr_payload["reservation_id"] == "res-1"

    checkin_res = client.post(
        "/v2/checkins",
        json={"reservation_id": "res-1", "scanner_id": "scanner-1"},
        headers=_header(),
    )
    assert checkin_res.status_code == 200
    assert checkin_res.json()["status"] == "checked_in"

    checkout_res = client.post(
        "/v2/checkouts",
        json={"reservation_id": "res-1", "scanner_id": "scanner-1"},
        headers=_header(),
    )
    assert checkout_res.status_code == 200
    assert checkout_res.json()["status"] == "checked_out"

    assert calls["checkin_reservation_id"] == "res-1"
    assert calls["override_reason"] is None
    assert calls["checkout_reservation_id"] == "res-1"


def test_override_checkin_flow(monkeypatch) -> None:
    calls: dict[str, str | None] = {}

    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.qr.validate_qr_checkin",
        lambda **_: {
            "reservation_id": "res-2",
            "reservation_code": "HR-TEST-OVERRIDE",
            "status": "for_verification",
            "allowed": False,
            "can_override": True,
            "reason": "Payment verification pending",
            "guest_name": "Guest Two",
        },
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.perform_checkin_rpc",
        lambda **kwargs: calls.update(
            {"checkin_reservation_id": kwargs.get("reservation_id"), "override_reason": kwargs.get("override_reason")}
        ),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.get_reservation_by_id",
        lambda _reservation_id: {
            "reservation_id": "res-2",
            "escrow_state": "none",
        },
    )

    qr_res = client.post(
        "/v2/qr/verify",
        json={"reservation_code": "HR-TEST-OVERRIDE", "scanner_id": "scanner-2"},
        headers=_header(),
    )
    assert qr_res.status_code == 200
    qr_payload = qr_res.json()
    assert qr_payload["allowed"] is False
    assert qr_payload["can_override"] is True

    checkin_res = client.post(
        "/v2/checkins",
        json={
            "reservation_id": "res-2",
            "scanner_id": "scanner-2",
            "override_reason": "Manager approved late confirmation",
        },
        headers=_header(),
    )
    assert checkin_res.status_code == 200
    assert calls["checkin_reservation_id"] == "res-2"
    assert calls["override_reason"] == "Manager approved late confirmation"


def test_override_checkin_releases_escrow(monkeypatch) -> None:
    calls: dict[str, str | None] = {}
    shadow_write: dict[str, str | int] = {}

    class _FakeChain:
        key = "sepolia"
        chain_id = 11155111
        enabled = True
        rpc_url = "https://example-rpc"
        escrow_contract_address = "0xabc"
        signer_private_key = "0x123"

    class _FakeSettlement:
        tx_hash = "0xreleasehash"
        onchain_booking_id = "0xbooking"
        event_index = 11

    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.qr.validate_qr_checkin",
        lambda **_: {
            "reservation_id": "res-3",
            "reservation_code": "HR-TEST-REL",
            "status": "pending_payment",
            "allowed": False,
            "can_override": True,
            "reason": "Payment required before check-in",
            "guest_name": "Guest Three",
        },
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.perform_checkin_rpc",
        lambda **kwargs: calls.update(
            {"checkin_reservation_id": kwargs.get("reservation_id"), "override_reason": kwargs.get("override_reason")}
        ),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.get_reservation_by_id",
        lambda _reservation_id: {
            "reservation_id": "res-3",
            "escrow_state": "locked",
            "chain_key": "sepolia",
            "onchain_booking_id": "0xbooking",
        },
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.perform_checkout_rpc",
        lambda **kwargs: calls.update({"checkout_reservation_id": kwargs.get("reservation_id")}),
    )
    monkeypatch.setattr("app.api.v2.routes.operations.settings.feature_escrow_onchain_lock", True)
    monkeypatch.setattr("app.api.v2.routes.operations.get_chain_registry", lambda: {"sepolia": _FakeChain()})
    monkeypatch.setattr("app.api.v2.routes.operations.get_active_chain", lambda: _FakeChain())
    monkeypatch.setattr(
        "app.api.v2.routes.operations.release_reservation_escrow_onchain",
        lambda **_: _FakeSettlement(),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.write_reservation_escrow_shadow_metadata",
        lambda **kwargs: shadow_write.update(kwargs),
    )

    qr_res = client.post(
        "/v2/qr/verify",
        json={"reservation_code": "HR-TEST-REL", "scanner_id": "scanner-3"},
        headers=_header(),
    )
    assert qr_res.status_code == 200
    assert qr_res.json()["can_override"] is True

    checkin_res = client.post(
        "/v2/checkins",
        json={
            "reservation_id": "res-3",
            "scanner_id": "scanner-3",
            "override_reason": "Manager approved check-in despite pending payment",
        },
        headers=_header(),
    )
    assert checkin_res.status_code == 200
    assert checkin_res.json()["status"] == "checked_in"

    assert calls["checkin_reservation_id"] == "res-3"
    assert calls["override_reason"] == "Manager approved check-in despite pending payment"
    assert shadow_write["reservation_id"] == "res-3"
    assert shadow_write["escrow_state"] == "released"
    assert shadow_write["tx_hash"] == "0xreleasehash"
    assert shadow_write["onchain_booking_id"] == "0xbooking"
