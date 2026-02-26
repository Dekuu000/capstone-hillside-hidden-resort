from fastapi.testclient import TestClient

from app.core.auth import AuthContext
from app.main import app

client = TestClient(app)


def _token_header(value: str = "token") -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}


def _mock_guest_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="guest-user",
        email="guest@example.com",
        role="guest",
        access_token="guest-token",
    )


def _mock_admin_auth(_: str) -> AuthContext:
    return AuthContext(
        user_id="admin-user",
        email="admin@example.com",
        role="admin",
        access_token="admin-token",
    )


class _FakeChain:
    key = "sepolia"
    chain_id = 11155111
    rpc_url = "https://example-rpc"
    escrow_contract_address = "0xabc"
    signer_private_key = "0x123"
    explorer_base_url = "https://sepolia.etherscan.io/tx/"
    enabled = True


def _row(escrow_state: str = "locked") -> dict:
    return {
        "reservation_id": "res-1",
        "reservation_code": "HR-TEST-001",
        "escrow_state": escrow_state,
        "chain_key": "sepolia",
        "chain_id": 11155111,
        "chain_tx_hash": "0xhash",
        "onchain_booking_id": "0xbooking",
    }


def test_escrow_reconciliation_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)

    response = client.get("/v2/escrow/reconciliation", headers=_token_header("guest-token"))
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_escrow_reconciliation_match(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.escrow.get_chain_registry", lambda: {"sepolia": _FakeChain()})
    monkeypatch.setattr("app.api.v2.routes.escrow.get_active_chain", lambda: _FakeChain())
    monkeypatch.setattr(
        "app.api.v2.routes.escrow.list_reservations_for_escrow_reconciliation",
        lambda **_: ([_row("locked")], 1),
    )

    class _Onchain:
        booking_id = "0xbooking"
        state = "locked"
        amount_wei = 1

    monkeypatch.setattr("app.api.v2.routes.escrow.read_escrow_record_onchain", lambda **_: _Onchain())

    response = client.get("/v2/escrow/reconciliation", headers=_token_header("admin-token"))
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["items"][0]["result"] == "match"
    assert payload["items"][0]["onchain_state"] == "locked"
    assert payload["summary"]["match"] == 1
    assert payload["summary"]["alert"] is False


def test_escrow_reconciliation_missing_onchain(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.escrow.get_chain_registry", lambda: {"sepolia": _FakeChain()})
    monkeypatch.setattr("app.api.v2.routes.escrow.get_active_chain", lambda: _FakeChain())
    monkeypatch.setattr(
        "app.api.v2.routes.escrow.list_reservations_for_escrow_reconciliation",
        lambda **_: ([_row("pending_lock")], 1),
    )

    class _Onchain:
        booking_id = "0xbooking"
        state = "none"
        amount_wei = 0

    monkeypatch.setattr("app.api.v2.routes.escrow.read_escrow_record_onchain", lambda **_: _Onchain())

    response = client.get("/v2/escrow/reconciliation", headers=_token_header("admin-token"))
    assert response.status_code == 200
    payload = response.json()
    assert payload["items"][0]["result"] == "missing_onchain"
    assert payload["items"][0]["reason"] == "No escrow record found on-chain for booking id."
    assert payload["summary"]["missing_onchain"] == 1
    assert payload["summary"]["alert"] is True


def test_escrow_cleanup_shadow_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    response = client.post(
        "/v2/escrow/cleanup-shadow",
        json={"execute": False},
        headers=_token_header("guest-token"),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_escrow_cleanup_shadow_dry_run_and_execute(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.escrow.get_chain_registry", lambda: {"sepolia": _FakeChain()})
    monkeypatch.setattr("app.api.v2.routes.escrow.get_active_chain", lambda: _FakeChain())

    candidates = [
        {
            "reservation_id": "res-a",
            "reservation_code": "HR-A",
            "escrow_state": "pending_lock",
            "chain_key": "sepolia",
            "chain_tx_hash": "shadow-a",
            "onchain_booking_id": "0xa",
            "created_at": "2026-02-21T10:00:00Z",
        },
        {
            "reservation_id": "res-b",
            "reservation_code": "HR-B",
            "escrow_state": "pending_lock",
            "chain_key": "sepolia",
            "chain_tx_hash": "shadow-b",
            "onchain_booking_id": "0xb",
            "created_at": "2026-02-21T10:05:00Z",
        },
    ]
    monkeypatch.setattr(
        "app.api.v2.routes.escrow.list_reservations_for_shadow_cleanup",
        lambda **_: candidates,
    )

    dry = client.post(
        "/v2/escrow/cleanup-shadow",
        json={"chain_key": "sepolia", "limit": 20, "execute": False},
        headers=_token_header("admin-token"),
    )
    assert dry.status_code == 200
    dry_payload = dry.json()
    assert dry_payload["executed"] is False
    assert dry_payload["candidate_count"] == 2
    assert dry_payload["cleaned_count"] == 0

    monkeypatch.setattr(
        "app.api.v2.routes.escrow.clear_reservation_shadow_escrow_metadata",
        lambda **kwargs: kwargs.get("reservation_id") == "res-a",
    )

    run = client.post(
        "/v2/escrow/cleanup-shadow",
        json={"chain_key": "sepolia", "limit": 20, "execute": True},
        headers=_token_header("admin-token"),
    )
    assert run.status_code == 200
    run_payload = run.json()
    assert run_payload["executed"] is True
    assert run_payload["candidate_count"] == 2
    assert run_payload["cleaned_count"] == 1
    assert run_payload["cleaned_reservation_ids"] == ["res-a"]


def test_escrow_reconciliation_monitor_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_guest_auth)
    response = client.get(
        "/v2/escrow/reconciliation-monitor",
        headers=_token_header("guest-token"),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_escrow_reconciliation_monitor_read_and_run(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _mock_admin_auth)
    monkeypatch.setattr("app.api.v2.routes.escrow.settings.feature_escrow_reconciliation_scheduler", True)
    base_snapshot = {
        "enabled": False,
        "running": False,
        "interval_sec": 300,
        "limit": 200,
        "chain_key": "sepolia",
        "last_started_at": None,
        "last_finished_at": None,
        "last_success_at": None,
        "last_duration_ms": None,
        "runs_total": 0,
        "consecutive_failures": 0,
        "last_error": None,
        "last_summary": None,
        "alert_thresholds": {"mismatch": 1, "missing_onchain": 1, "skipped": 1},
        "alert_active": False,
    }
    monkeypatch.setattr(
        "app.api.v2.routes.escrow.get_escrow_reconciliation_monitor_snapshot",
        lambda: dict(base_snapshot),
    )
    monkeypatch.setattr(
        "app.api.v2.routes.escrow.run_escrow_reconciliation_once_now",
        lambda: {
            **base_snapshot,
            "runs_total": 1,
            "last_summary": {
                "total": 2,
                "match": 2,
                "mismatch": 0,
                "missing_onchain": 0,
                "skipped": 0,
                "alert": False,
            },
        },
    )

    read = client.get(
        "/v2/escrow/reconciliation-monitor",
        headers=_token_header("admin-token"),
    )
    assert read.status_code == 200
    read_payload = read.json()
    assert read_payload["enabled"] is True
    assert read_payload["runs_total"] == 0

    run = client.post(
        "/v2/escrow/reconciliation-monitor/run",
        headers=_token_header("admin-token"),
    )
    assert run.status_code == 200
    run_payload = run.json()
    assert run_payload["enabled"] is True
    assert run_payload["runs_total"] == 1
    assert run_payload["last_summary"]["match"] == 2
