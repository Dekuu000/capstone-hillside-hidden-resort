from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class ChainConfig:
    key: str
    chain_id: int
    rpc_url: str
    escrow_contract_address: str
    guest_pass_contract_address: str
    signer_private_key: str
    explorer_base_url: str
    enabled: bool


def _normalize_keys(raw: str) -> set[str]:
    return {value.strip().lower() for value in raw.split(",") if value.strip()}


def get_chain_registry() -> dict[str, ChainConfig]:
    allowed_keys = _normalize_keys(settings.chain_allowed_keys)

    sepolia_rpc = (settings.evm_rpc_url_sepolia or "").strip()
    amoy_rpc = (settings.evm_rpc_url_amoy or settings.polygon_rpc_url_amoy or "").strip()

    sepolia_contract = (settings.escrow_contract_address_sepolia or "").strip()
    amoy_contract = (
        settings.escrow_contract_address_amoy
        or (settings.escrow_contract_address if settings.chain_active_key.lower() == "amoy" else "")
    ).strip()
    sepolia_guest_pass = (settings.guest_pass_contract_address_sepolia or "").strip()
    amoy_guest_pass = (settings.guest_pass_contract_address_amoy or "").strip()

    sepolia_signer = (
        settings.escrow_signer_private_key_sepolia or settings.escrow_signer_private_key
    ).strip()
    amoy_signer = (
        settings.escrow_signer_private_key_amoy or settings.escrow_signer_private_key
    ).strip()

    registry = {
        "sepolia": ChainConfig(
            key="sepolia",
            chain_id=settings.chain_id_sepolia,
            rpc_url=sepolia_rpc,
            escrow_contract_address=sepolia_contract,
            guest_pass_contract_address=sepolia_guest_pass,
            signer_private_key=sepolia_signer,
            explorer_base_url=(settings.explorer_base_url_sepolia or "").strip(),
            enabled="sepolia" in allowed_keys,
        ),
        "amoy": ChainConfig(
            key="amoy",
            chain_id=settings.chain_id_amoy or settings.chain_id,
            rpc_url=amoy_rpc,
            escrow_contract_address=amoy_contract,
            guest_pass_contract_address=amoy_guest_pass,
            signer_private_key=amoy_signer,
            explorer_base_url=(settings.explorer_base_url_amoy or "").strip(),
            enabled="amoy" in allowed_keys,
        ),
    }

    return registry


def get_active_chain() -> ChainConfig:
    registry = get_chain_registry()
    active_key = (settings.chain_active_key or "").strip().lower()

    if active_key in registry:
        return registry[active_key]

    # Safe fallback keeps API running even if env is misconfigured.
    if "sepolia" in registry:
        return registry["sepolia"]
    return next(iter(registry.values()))
