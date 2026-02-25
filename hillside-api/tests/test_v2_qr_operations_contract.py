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


def _guest_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="guest-user",
        email="guest@example.com",
        role="guest",
        access_token="guest-token",
    )


def _header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_qr_verify_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    response = client.post(
        "/v2/qr/verify",
        json={"reservation_code": "HR-TEST-001", "scanner_id": "scanner-1"},
        headers=_header("guest-token"),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_qr_verify_returns_validation_payload(monkeypatch) -> None:
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
        },
    )

    response = client.post(
        "/v2/qr/verify",
        json={"reservation_code": "HR-TEST-001", "scanner_id": "scanner-1"},
        headers=_header("admin-token"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_id"] == "res-1"
    assert payload["scanner_id"] == "scanner-1"
    assert payload["allowed"] is True


def test_checkin_checkout_are_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    checkin = client.post(
        "/v2/checkins",
        json={"reservation_id": "res-1"},
        headers=_header("guest-token"),
    )
    checkout = client.post(
        "/v2/checkouts",
        json={"reservation_id": "res-1"},
        headers=_header("guest-token"),
    )
    assert checkin.status_code == 403
    assert checkout.status_code == 403


def test_checkin_checkout_call_domain_ops(monkeypatch) -> None:
    calls: dict[str, str | None] = {}
    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.operations.get_reservation_by_id",
        lambda _reservation_id: {
            "reservation_id": "res-1",
            "escrow_state": "none",
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

    checkin = client.post(
        "/v2/checkins",
        json={"reservation_id": "res-1", "override_reason": "Late verified by admin"},
        headers=_header("admin-token"),
    )
    checkout = client.post(
        "/v2/checkouts",
        json={"reservation_id": "res-1"},
        headers=_header("admin-token"),
    )

    assert checkin.status_code == 200
    assert checkout.status_code == 200
    assert calls["checkin_reservation_id"] == "res-1"
    assert calls["override_reason"] == "Late verified by admin"
    assert calls["checkout_reservation_id"] == "res-1"


def test_checkin_applies_escrow_release_when_locked(monkeypatch) -> None:
    called: dict[str, str | int] = {}

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
        event_index = 8

    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    monkeypatch.setattr(
        "app.api.v2.routes.operations.get_reservation_by_id",
        lambda _reservation_id: {
            "reservation_id": "res-1",
            "escrow_state": "locked",
            "chain_key": "sepolia",
            "onchain_booking_id": "0xbooking",
        },
    )
    monkeypatch.setattr("app.api.v2.routes.operations.perform_checkin_rpc", lambda **_: None)
    monkeypatch.setattr("app.api.v2.routes.operations.settings.feature_escrow_onchain_lock", True)
    monkeypatch.setattr("app.api.v2.routes.operations.get_chain_registry", lambda: {"sepolia": _FakeChain()})
    monkeypatch.setattr("app.api.v2.routes.operations.get_active_chain", lambda: _FakeChain())
    monkeypatch.setattr(
        "app.api.v2.routes.operations.release_reservation_escrow_onchain",
        lambda **_: _FakeSettlement(),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.operations.write_reservation_escrow_shadow_metadata",
        lambda **kwargs: called.update(kwargs),
    )

    response = client.post(
        "/v2/checkins",
        json={"reservation_id": "res-1", "scanner_id": "scanner-1"},
        headers=_header("admin-token"),
    )

    assert response.status_code == 200
    assert called["reservation_id"] == "res-1"
    assert called["tx_hash"] == "0xreleasehash"
    assert called["onchain_booking_id"] == "0xbooking"
    assert called["escrow_state"] == "released"
    assert called["escrow_event_index"] == 8


def test_dynamic_qr_issue_and_verify_blocks_replay(monkeypatch) -> None:
    def _mixed_auth(token: str) -> AuthContext:
        if token == "guest-token":
            return AuthContext(
                user_id="guest-user",
                email="guest@example.com",
                role="guest",
                access_token="guest-token",
            )
        return _admin_auth(token)

    monkeypatch.setattr("app.core.auth.verify_access_token", _mixed_auth)
    monkeypatch.setattr("app.api.v2.routes.qr.settings.feature_dynamic_qr", True)
    monkeypatch.setattr("app.api.v2.routes.qr.settings.qr_signing_secret", "test-secret")
    monkeypatch.setattr("app.api.v2.routes.qr.settings.qr_rotation_seconds", 30)
    monkeypatch.setattr(
        "app.api.v2.routes.qr.get_my_booking_details",
        lambda **_: {
            "reservation_id": "11111111-1111-1111-1111-111111111111",
            "reservation_code": "HR-TEST-DYNAMIC",
        },
    )
    monkeypatch.setattr("app.api.v2.routes.qr.create_qr_token_record", lambda **_: None)

    consumed = {"count": 0}
    issued_token: dict[str, str] = {"signature": "", "rotation_version": "1"}

    def _consume(**_kwargs):
        consumed["count"] += 1
        return consumed["count"] == 1

    monkeypatch.setattr("app.api.v2.routes.qr.consume_qr_token_record", _consume)
    monkeypatch.setattr(
        "app.api.v2.routes.qr.get_qr_token_record",
        lambda **kwargs: {
            "jti": kwargs["jti"],
            "reservation_id": "11111111-1111-1111-1111-111111111111",
            "reservation_code": "HR-TEST-DYNAMIC",
            "rotation_version": int(issued_token["rotation_version"] or "1"),
            "signature": issued_token["signature"],
            "token_payload": "{}",
            "expires_at": "2099-01-01T00:00:00+00:00",
            "consumed_at": None if consumed["count"] == 0 else "2026-02-21T00:00:00+00:00",
            "revoked": False,
        },
    )
    monkeypatch.setattr(
        "app.api.v2.routes.qr.get_reservation_by_id",
        lambda *_: {"reservation_id": "11111111-1111-1111-1111-111111111111", "reservation_code": "HR-TEST-DYNAMIC"},
    )
    monkeypatch.setattr(
        "app.api.v2.routes.qr.validate_qr_checkin",
        lambda **_: {
            "reservation_id": "11111111-1111-1111-1111-111111111111",
            "reservation_code": "HR-TEST-DYNAMIC",
            "status": "confirmed",
            "allowed": True,
            "can_override": False,
            "reason": None,
        },
    )

    issue = client.post(
        "/v2/qr/issue",
        json={"reservation_id": "11111111-1111-1111-1111-111111111111"},
        headers=_header("guest-token"),
    )
    assert issue.status_code == 200
    qr_token = issue.json()
    issued_token["signature"] = str(qr_token["signature"])
    issued_token["rotation_version"] = str(qr_token["rotation_version"])
    assert qr_token["jti"]
    assert qr_token["signature"]

    verify_ok = client.post(
        "/v2/qr/verify",
        json={"qr_token": qr_token, "scanner_id": "scanner-1", "offline_mode": False},
        headers=_header("admin-token"),
    )
    assert verify_ok.status_code == 200
    assert verify_ok.json()["allowed"] is True

    verify_replay = client.post(
        "/v2/qr/verify",
        json={"qr_token": qr_token, "scanner_id": "scanner-1", "offline_mode": False},
        headers=_header("admin-token"),
    )
    assert verify_replay.status_code == 409
    assert "already used" in str(verify_replay.json()["detail"]).lower()
