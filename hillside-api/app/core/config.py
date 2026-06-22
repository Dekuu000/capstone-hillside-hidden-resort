from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    app_env: str = "local"
    app_name: str = "hillside-api"
    api_version: str = "v2"
    api_cors_allowed_origins: str = "http://localhost:5173,http://localhost:3000"
    api_cors_allow_credentials: bool = True

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    api_jwt_issuer: str = ""
    api_jwt_audience: str = "authenticated"
    cache_ttl_seconds: int = 60
    reservation_pending_payment_hold_minutes: int = 120
    reservation_hold_cleanup_batch_size: int = 200
    feature_offline_sync: bool = True
    sync_pull_default_limit: int = 200
    sync_pull_max_limit: int = 500
    sync_push_max_batch_size: int = 50
    sync_idempotency_retention_hours: int = 168
    sync_cursor_ttl_hours: int = 72

    feature_escrow_shadow_write: bool = False
    feature_escrow_onchain_lock: bool = False
    feature_nft_guest_pass: bool = False
    feature_dynamic_qr: bool = False
    feature_escrow_reconciliation_scheduler: bool = False
    feature_upcoming_stay_reminders: bool = True
    upcoming_stay_reminder_interval_sec: int = 3600
    upcoming_stay_reminder_lookahead_days: int = 2
    # Auto-release of unpaid holds: cancel pending_payment bookings older than the
    # window so the held unit/slot frees up automatically.
    feature_release_expired_holds: bool = True
    release_expired_holds_interval_sec: int = 600
    release_expired_holds_window_min: int = 120
    # Auto no-show: flag confirmed bookings whose check-out date has passed (guest
    # never checked in) as no_show, forfeiting the deposit.
    feature_auto_no_show: bool = True
    auto_no_show_interval_sec: int = 3600
    auto_no_show_grace_days: int = 1
    # Retention: delete read notifications older than the window (unread are
    # never pruned). Keeps the notifications table from growing without bound.
    feature_notification_retention: bool = True
    notification_retention_interval_sec: int = 86400
    notification_retention_days: int = 90
    feature_checkin_welcome_notification: bool = False
    feature_checkin_schedule_bypass: bool = False
    qr_signing_secret: str = ""
    qr_signing_private_key: str = ""
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
    escrow_rpc_timeout_sec: int = 8
    escrow_tx_receipt_timeout_sec: int = 90
    escrow_reconciliation_interval_sec: int = 300
    escrow_reconciliation_limit: int = 200
    escrow_release_retry_batch_size: int = 20
    escrow_release_retry_interval_sec: int = 300
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
    ai_require_prophet_forecast: bool = False
    checkin_welcome_suggestions_limit: int = 2
    payment_webhook_secret: str = ""
    xendit_callback_token: str = ""
    payment_mode: str = "proof_only"


settings = Settings()
