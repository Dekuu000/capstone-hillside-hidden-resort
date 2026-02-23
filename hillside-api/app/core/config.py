from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    app_name: str = "hillside-api"
    api_version: str = "v2"
    api_cors_allowed_origins: str = "http://localhost:5173,http://localhost:3000"
    api_cors_allow_credentials: bool = True

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    api_jwt_issuer: str = ""
    api_jwt_audience: str = "authenticated"

    feature_escrow_shadow_write: bool = False
    feature_escrow_onchain_lock: bool = False
    feature_nft_guest_pass: bool = False
    feature_dynamic_qr: bool = False
    feature_escrow_reconciliation_scheduler: bool = False
    qr_signing_secret: str = ""
    qr_rotation_seconds: int = 30
    qr_verify_leeway_seconds: int = 5

    chain_active_key: str = "sepolia"
    chain_allowed_keys: str = "sepolia,amoy"

    evm_rpc_url_sepolia: str = ""
    evm_rpc_url_amoy: str = ""

    chain_id_sepolia: int = 11155111
    chain_id_amoy: int = 80002

    escrow_contract_address_sepolia: str = ""
    escrow_contract_address_amoy: str = ""
    guest_pass_contract_address_sepolia: str = ""
    guest_pass_contract_address_amoy: str = ""
    escrow_signer_private_key_sepolia: str = ""
    escrow_signer_private_key_amoy: str = ""
    escrow_lock_amount_wei: int = 1
    escrow_tx_receipt_timeout_sec: int = 90
    escrow_reconciliation_interval_sec: int = 300
    escrow_reconciliation_limit: int = 200
    escrow_reconciliation_chain_key: str = ""
    escrow_reconciliation_alert_mismatch_threshold: int = 1
    escrow_reconciliation_alert_missing_onchain_threshold: int = 1
    escrow_reconciliation_alert_skipped_threshold: int = 1

    explorer_base_url_sepolia: str = "https://sepolia.etherscan.io/tx/"
    explorer_base_url_amoy: str = "https://amoy.polygonscan.com/tx/"

    # Legacy single-chain fields retained for backward compatibility.
    polygon_rpc_url_amoy: str = ""
    chain_id: int = 80002
    escrow_contract_address: str = ""
    escrow_signer_private_key: str = ""

    ai_service_base_url: str = ""
    ai_inference_timeout_ms: int = 1500


settings = Settings()
