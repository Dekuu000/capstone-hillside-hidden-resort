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


def test_chain_config_route_is_admin_only(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _guest_auth)
    response = client.get("/v2/chains", headers={"Authorization": "Bearer guest-token"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required."


def test_chain_config_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.core.auth.verify_access_token", _admin_auth)
    monkeypatch.setattr("app.core.config.settings.chain_active_key", "sepolia")
    monkeypatch.setattr("app.core.config.settings.chain_allowed_keys", "sepolia,amoy")
    monkeypatch.setattr("app.core.config.settings.evm_rpc_url_sepolia", "https://rpc-sepolia.example")
    monkeypatch.setattr("app.core.config.settings.evm_rpc_url_amoy", "https://rpc-amoy.example")
    monkeypatch.setattr(
        "app.core.config.settings.escrow_contract_address_sepolia",
        "0x1111111111111111111111111111111111111111",
    )
    monkeypatch.setattr(
        "app.core.config.settings.escrow_contract_address_amoy",
        "0x2222222222222222222222222222222222222222",
    )

    response = client.get("/v2/chains", headers={"Authorization": "Bearer admin-token"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["active_chain"]["key"] == "sepolia"
    assert payload["active_chain"]["chain_id"] == 11155111
    assert payload["chains"]["amoy"]["chain_id"] == 80002
    assert payload["chains"]["sepolia"]["enabled"] is True


def test_health_includes_chain_overview(monkeypatch) -> None:
    monkeypatch.setattr("app.core.config.settings.chain_active_key", "amoy")
    monkeypatch.setattr("app.core.config.settings.chain_allowed_keys", "sepolia,amoy")
    monkeypatch.setattr("app.core.config.settings.evm_rpc_url_amoy", "https://rpc-amoy.example")
    monkeypatch.setattr(
        "app.core.config.settings.escrow_contract_address_amoy",
        "0x3333333333333333333333333333333333333333",
    )

    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["active_chain"]["key"] == "amoy"
    assert payload["active_chain"]["chain_id"] == 80002
    assert "sepolia" in payload["chains"]
