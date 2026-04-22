from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class BookingStatus(StrEnum):
    DRAFT = "draft"
    PENDING_PAYMENT = "pending_payment"
    ESCROW_LOCKED = "escrow_locked"
    FOR_VERIFICATION = "for_verification"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class UnitOperationalStatus(StrEnum):
    CLEANED = "cleaned"
    OCCUPIED = "occupied"
    MAINTENANCE = "maintenance"
    DIRTY = "dirty"


class EscrowRef(BaseModel):
    chain_key: Literal["sepolia", "amoy"] | None = None
    chain_id: int
    contract_address: str
    tx_hash: str
    event_index: int
    state: Literal["pending", "locked", "pending_release", "released", "refunded", "failed"]


class GuestPassRef(BaseModel):
    chain_key: Literal["sepolia", "amoy"] | None = None
    contract_address: str
    tx_hash: str
    token_id: int
    reservation_hash: str
    owner: str | None = None


class QrToken(BaseModel):
    jti: str
    reservation_id: str
    reservation_code: str | None = None
    expires_at: datetime
    signature: str
    rotation_version: int
    booking_hash: str | None = None
    nft_token_id: int | None = None


class QrIssueRequest(BaseModel):
    reservation_id: str


class QrVerifyRequest(BaseModel):
    reservation_code: str | None = None
    qr_token: QrToken | None = None
    scanner_id: str
    offline_mode: bool = False


class QrPublicKeyResponse(BaseModel):
    algorithm: str = "ed25519"
    key_id: str
    public_key: str


class AiRecommendation(BaseModel):
    reservation_id: str
    pricing_adjustment: float
    confidence: float = Field(ge=0.0, le=1.0)
    explanations: list[str]
    suggested_multiplier: float | None = None
    demand_bucket: str | None = None
    signal_breakdown: list[dict[str, float | str]] = Field(default_factory=list)
    confidence_breakdown: dict[str, float] | None = None


class AiLatencySummary(BaseModel):
    count: int = 0
    avg_ms: float = 0
    p50_ms: float = 0
    p95_ms: float = 0
    last_ms: float = 0


class AiPricingMetricsResponse(BaseModel):
    generated_at: datetime
    total_requests: int = 0
    remote_success: int = 0
    fallback_count: int = 0
    fallback_rate: float = 0
    last_fallback_reason: str | None = None
    last_fallback_at: datetime | None = None
    latency_ms: AiLatencySummary = Field(default_factory=AiLatencySummary)


class ReservationCreateRequest(BaseModel):
    check_in_date: date
    check_out_date: date
    unit_ids: list[str]
    guest_count: int = Field(default=1, ge=1)
    idempotency_key: str


class WalkInStayCreateRequest(BaseModel):
    check_in_date: date
    check_out_date: date
    unit_ids: list[str]
    guest_name: str | None = None
    guest_phone: str | None = None
    notes: str | None = None
    expected_pay_now: float | None = Field(default=None, ge=0)
    idempotency_key: str | None = None


class ReservationPolicyMetadata(BaseModel):
    deposit_policy_version: str | None = None
    deposit_rule_applied: str | None = None
    cancellation_actor: Literal["guest", "admin"] | None = None
    policy_outcome: Literal["released", "refunded", "forfeited"] | None = None


class ReservationPaymentPolicyMetadata(ReservationPolicyMetadata):
    deposit_required: float | None = None
    expected_pay_now: float | None = None


class ReservationResponse(ReservationPaymentPolicyMetadata):
    reservation_id: str
    reservation_code: str
    status: BookingStatus
    escrow_ref: EscrowRef | None = None
    guest_pass_ref: GuestPassRef | None = None
    ai_recommendation: AiRecommendation | None = None


class TourReservationCreateRequest(BaseModel):
    service_id: str
    visit_date: date
    adult_qty: int = Field(ge=0)
    kid_qty: int = Field(ge=0)
    is_advance: bool = True
    expected_pay_now: float | None = Field(default=None, ge=0)
    notes: str | None = None
    idempotency_key: str | None = None


class ServiceItem(BaseModel):
    service_id: str
    service_name: str
    service_type: str | None = None
    status: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    adult_rate: float | None = None
    kid_rate: float | None = None
    max_pax: int | None = None
    description: str | None = None


class ServiceListResponse(BaseModel):
    items: list[ServiceItem]
    count: int


class UnitItem(BaseModel):
    unit_id: str
    name: str
    unit_code: str | None = None
    room_number: str | None = None
    type: str
    description: str | None = None
    base_price: float
    capacity: int
    is_active: bool
    operational_status: UnitOperationalStatus = UnitOperationalStatus.CLEANED
    image_url: str | None = None
    image_urls: list[str] | None = None
    image_thumb_urls: list[str] | None = None
    amenities: list[str] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class UnitListResponse(BaseModel):
    items: list[UnitItem]
    count: int
    limit: int
    offset: int
    has_more: bool


class UnitStatusUpdateRequest(BaseModel):
    is_active: bool


class UnitStatusUpdateResponse(BaseModel):
    ok: bool = True
    unit: UnitItem


class UnitOperationalStatusUpdateRequest(BaseModel):
    operational_status: UnitOperationalStatus


class UnitCreateRequest(BaseModel):
    name: str
    unit_code: str | None = None
    room_number: str | None = None
    type: Literal["room", "cottage", "amenity"]
    description: str | None = None
    base_price: float = Field(ge=0)
    capacity: int = Field(ge=1)
    is_active: bool = True
    operational_status: UnitOperationalStatus = UnitOperationalStatus.CLEANED
    image_url: str | None = None
    image_urls: list[str] | None = None
    image_thumb_urls: list[str] | None = None
    amenities: list[str] | None = None


class UnitUpdateRequest(BaseModel):
    name: str | None = None
    unit_code: str | None = None
    room_number: str | None = None
    type: Literal["room", "cottage", "amenity"] | None = None
    description: str | None = None
    base_price: float | None = Field(default=None, ge=0)
    capacity: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    operational_status: UnitOperationalStatus | None = None
    image_url: str | None = None
    image_urls: list[str] | None = None
    image_thumb_urls: list[str] | None = None
    amenities: list[str] | None = None


class UnitWriteResponse(BaseModel):
    ok: bool = True
    unit: UnitItem


class UnitDeleteResponse(BaseModel):
    ok: bool = True
    unit_id: str
    is_active: Literal[False] = False


class ReportDailyItem(BaseModel):
    report_date: date
    bookings: int = 0
    cancellations: int = 0
    cash_collected: float = 0
    occupancy_rate: float = 0
    unit_booked_value: float = 0
    tour_booked_value: float = 0


class ReportMonthlyItem(BaseModel):
    report_month: date
    bookings: int = 0
    cancellations: int = 0
    cash_collected: float = 0
    occupancy_rate: float = 0
    unit_booked_value: float = 0
    tour_booked_value: float = 0


class ReportSummary(BaseModel):
    bookings: int = 0
    cancellations: int = 0
    cash_collected: float = 0
    occupancy_rate: float = 0
    unit_booked_value: float = 0
    tour_booked_value: float = 0


class ReportsOverviewResponse(BaseModel):
    from_date: date
    to_date: date
    summary: ReportSummary
    daily: list[ReportDailyItem] = Field(default_factory=list)
    monthly: list[ReportMonthlyItem] = Field(default_factory=list)


class ReportTransactionItem(BaseModel):
    payment_id: str
    reservation_code: str | None = None
    amount: float
    status: str
    method: str
    payment_type: str
    created_at: datetime
    verified_at: datetime | None = None


class ReportTransactionsResponse(BaseModel):
    items: list[ReportTransactionItem]
    count: int
    limit: int
    offset: int
    has_more: bool


class DashboardSummaryMetrics(BaseModel):
    active_units: int = 0
    for_verification: int = 0
    pending_payments: int = 0
    confirmed: int = 0


class DashboardSummaryResponse(BaseModel):
    from_date: date
    to_date: date
    metrics: DashboardSummaryMetrics
    summary: ReportSummary


class ResortSnapshotOccupancy(BaseModel):
    occupied_units: int = 0
    active_units: int = 0
    occupancy_rate: float = 0


class ResortSnapshotRevenue(BaseModel):
    fiat_php_7d: float = 0
    crypto_native_total: float = 0
    crypto_tx_count: int = 0
    crypto_chain_key: str = "sepolia"
    crypto_unit: str = "ETH"


class ResortSnapshotAiDemandItem(BaseModel):
    date: date
    occupancy_pct: int = 0


class ResortSnapshotAiDemand(BaseModel):
    status: Literal["ready", "stale", "missing"] = "missing"
    model_version: str | None = None
    avg_occupancy_pct: int = 0
    peak_occupancy_pct: int = 0
    peak_date: date | None = None
    items: list[ResortSnapshotAiDemandItem] = Field(default_factory=list)


class ResortSnapshotResponse(BaseModel):
    as_of: datetime
    occupancy: ResortSnapshotOccupancy
    revenue: ResortSnapshotRevenue
    ai_demand_7d: ResortSnapshotAiDemand


class ReservationGuestSummary(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None


class ReservationUnitInfo(BaseModel):
    name: str | None = None
    unit_code: str | None = None
    room_number: str | None = None
    type: str | None = None
    amenities: list[str] | None = None
    image_url: str | None = None
    image_urls: list[str] | None = None
    image_thumb_urls: list[str] | None = None


class ReservationUnitSummary(BaseModel):
    reservation_unit_id: str
    quantity_or_nights: float
    rate_snapshot: float
    unit: ReservationUnitInfo | None = None


class ReservationServiceInfo(BaseModel):
    service_name: str | None = None


class ReservationServiceBookingSummary(BaseModel):
    service_booking_id: str
    visit_date: date | None = None
    total_amount: float
    adult_qty: int | None = None
    kid_qty: int | None = None
    service: ReservationServiceInfo | None = None


class ReservationListItem(ReservationPaymentPolicyMetadata):
    reservation_id: str
    reservation_code: str
    status: BookingStatus
    created_at: datetime
    check_in_date: date
    check_out_date: date
    total_amount: float
    amount_paid_verified: float | None = None
    balance_due: float | None = None
    guest_count: int | None = None
    notes: str | None = None
    reservation_source: Literal["online", "walk_in"] = "online"
    guest: ReservationGuestSummary | None = None
    units: list[ReservationUnitSummary] = Field(default_factory=list)
    service_bookings: list[ReservationServiceBookingSummary] = Field(default_factory=list)


class ReservationListResponse(BaseModel):
    items: list[ReservationListItem]
    count: int
    limit: int
    offset: int
    has_more: bool


class ReservationStatusUpdateRequest(BaseModel):
    status: BookingStatus
    notes: str | None = None


class ReservationStatusUpdateResponse(BaseModel):
    ok: bool = True
    reservation: ReservationListItem


class MyBookingsCursor(BaseModel):
    checkInDate: str | None = None
    createdAt: str
    reservationId: str


class MyBookingsResponse(BaseModel):
    items: list[ReservationListItem]
    nextCursor: MyBookingsCursor | None = None
    totalCount: int


class CancelReservationResponse(ReservationPolicyMetadata):
    ok: bool = True
    reservation_id: str
    status: Literal["cancelled"] = "cancelled"


class PaymentAdminUserSummary(BaseModel):
    user_id: str
    name: str | None = None
    email: str | None = None


class PaymentReservationGuestSummary(BaseModel):
    name: str | None = None
    email: str | None = None


class PaymentReservationSummary(ReservationPolicyMetadata):
    reservation_code: str
    status: BookingStatus | None = None
    reservation_source: Literal["online", "walk_in"] = "online"
    total_amount: float | None = None
    deposit_required: float | None = None
    guest: PaymentReservationGuestSummary | None = None


class AdminPaymentItem(BaseModel):
    payment_id: str
    reservation_id: str | None = None
    payment_type: str
    amount: float
    method: str
    reference_no: str | None = None
    proof_url: str | None = None
    status: Literal["pending", "verified", "rejected"]
    verified_at: datetime | None = None
    verified_by_admin_id: str | None = None
    rejected_reason: str | None = None
    rejected_at: datetime | None = None
    rejected_by_admin_id: str | None = None
    created_at: datetime | None = None
    reservation: PaymentReservationSummary | None = None
    verified_admin: PaymentAdminUserSummary | None = None
    rejected_admin: PaymentAdminUserSummary | None = None


class AdminPaymentsResponse(BaseModel):
    items: list[AdminPaymentItem]
    count: int
    limit: int
    offset: int
    has_more: bool


class OnSitePaymentRequest(BaseModel):
    reservation_id: str
    amount: float
    method: str
    reference_no: str | None = None
    idempotency_key: str | None = None


class PaymentSubmissionRequest(BaseModel):
    reservation_id: str
    amount: float
    payment_type: str
    method: str
    reference_no: str | None = None
    proof_url: str | None = None
    idempotency_key: str


class PaymentSubmissionResponse(BaseModel):
    payment_id: str
    status: str
    reservation_status: str


class PaymentRejectRequest(BaseModel):
    reason: str


class PaymentIntentUpdateRequest(BaseModel):
    reservation_id: str
    amount: float


class OnSitePaymentResponse(BaseModel):
    ok: bool = True
    payment_id: str
    status: str
    reservation_status: str


class CheckinWelcomeSuggestion(BaseModel):
    code: str
    title: str
    description: str | None = None
    reasons: list[str] = Field(default_factory=list)


class CheckinWelcomeNotificationSummary(BaseModel):
    created: bool = False
    notification_id: str | None = None
    fallback_used: bool = False
    model_version: str | None = None


class CheckOperationResponse(BaseModel):
    ok: bool = True
    reservation_id: str
    status: Literal["checked_in", "checked_out"]
    scanner_id: str | None = None
    escrow_release_state: Literal["released", "pending_release", "skipped"] | None = None
    welcome_notification: CheckinWelcomeNotificationSummary | None = None


class CheckOperationRequest(BaseModel):
    reservation_id: str
    scanner_id: str | None = None
    override_reason: str | None = None
    idempotency_key: str | None = None


class WelcomeNotification(BaseModel):
    notification_id: str
    reservation_id: str
    guest_user_id: str
    event_type: Literal["checkin_welcome"] = "checkin_welcome"
    title: str
    message: str
    suggestions: list[CheckinWelcomeSuggestion] = Field(default_factory=list)
    model_version: str | None = None
    source: str = "hillside-ai"
    fallback_used: bool = False
    metadata: dict = Field(default_factory=dict)
    created_at: datetime
    read_at: datetime | None = None


class StayDashboardResponse(BaseModel):
    reservation: ReservationListItem | None = None
    welcome_notification: WelcomeNotification | None = None


class EscrowReleaseRetryRequest(BaseModel):
    reservation_id: str


class EscrowReleaseRetryResponse(BaseModel):
    ok: bool = True
    reservation_id: str
    escrow_state: Literal["released", "pending_release", "locked", "skipped"]
    tx_hash: str | None = None
    message: str | None = None


class MyProfileResponse(BaseModel):
    user_id: str
    email: str | None = None
    name: str | None = None
    phone: str | None = None
    wallet_address: str | None = None
    wallet_chain: str = "evm"


class MyProfilePatchRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    wallet_address: str | None = None
    wallet_chain: str | None = None


class ResortServiceItem(BaseModel):
    service_item_id: str
    category: Literal["room_service", "spa"]
    service_name: str
    description: str | None = None
    price: float
    eta_minutes: int | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ResortServiceListResponse(BaseModel):
    items: list[ResortServiceItem]
    count: int


class ResortServiceRequestCreateRequest(BaseModel):
    service_item_id: str
    reservation_id: str | None = None
    quantity: int = Field(default=1, ge=1)
    preferred_time: datetime | None = None
    notes: str | None = None
    idempotency_key: str | None = None


class ResortServiceRequestStatusPatchRequest(BaseModel):
    status: Literal["new", "in_progress", "done", "cancelled"]
    notes: str | None = None


class ResortServiceRequestItem(BaseModel):
    request_id: str
    guest_user_id: str
    reservation_id: str | None = None
    service_item_id: str
    quantity: int
    preferred_time: datetime | None = None
    notes: str | None = None
    status: Literal["new", "in_progress", "done", "cancelled"]
    requested_at: datetime
    processed_at: datetime | None = None
    processed_by_user_id: str | None = None
    updated_at: datetime | None = None
    guest: ReservationGuestSummary | None = None
    reservation: PaymentReservationSummary | None = None
    service_item: ResortServiceItem | None = None


class ResortServiceRequestListResponse(BaseModel):
    items: list[ResortServiceRequestItem]
    count: int
    limit: int
    offset: int
    has_more: bool


class VerifyPaymentResponse(BaseModel):
    ok: bool = True
    payment_id: str
    status: Literal["verified"] = "verified"


class RejectPaymentResponse(BaseModel):
    ok: bool = True
    payment_id: str
    status: Literal["rejected"] = "rejected"
    reason: str


class AuditPerformedBy(BaseModel):
    name: str | None = None
    email: str | None = None


class AuditLogItem(BaseModel):
    audit_id: str
    performed_by_user_id: str | None = None
    entity_type: str
    entity_id: str
    action: str
    data_hash: str
    metadata: dict | None = None
    blockchain_tx_hash: str | None = None
    anchor_id: str | None = None
    timestamp: datetime
    performed_by: AuditPerformedBy | None = None


class AuditLogsResponse(BaseModel):
    items: list[AuditLogItem]
    count: int
    limit: int
    offset: int
    has_more: bool


class EscrowReconciliationItem(BaseModel):
    reservation_id: str
    reservation_code: str
    db_escrow_state: str
    chain_key: str | None = None
    chain_id: int | None = None
    chain_tx_hash: str | None = None
    onchain_booking_id: str | None = None
    onchain_state: Literal["none", "locked", "released", "refunded"] | None = None
    onchain_amount_wei: str | None = None
    reservation_updated_at: datetime | None = None
    result: Literal["match", "mismatch", "missing_onchain", "skipped"]
    reason: str | None = None


class EscrowReconciliationSummary(BaseModel):
    total: int = 0
    match: int = 0
    mismatch: int = 0
    missing_onchain: int = 0
    skipped: int = 0
    alert: bool = False


class EscrowReconciliationResponse(BaseModel):
    items: list[EscrowReconciliationItem]
    count: int
    limit: int
    offset: int
    has_more: bool
    summary: EscrowReconciliationSummary = Field(default_factory=EscrowReconciliationSummary)
    cached: bool = True
    in_progress: bool = False
    last_reconciled_at: datetime | None = None


class ContractStatusGasSnapshot(BaseModel):
    base_fee_gwei: float | None = None
    priority_fee_gwei: float | None = None
    source: Literal["live", "cached", "unavailable"] = "unavailable"
    stale: bool = False
    last_updated_at: datetime | None = None
    note: str | None = None


class ContractStatusTxItem(BaseModel):
    reservation_id: str
    reservation_code: str
    escrow_state: Literal["locked", "released", "refunded", "pending_lock", "pending_release", "failed"]
    chain_tx_hash: str
    onchain_booking_id: str | None = None
    updated_at: datetime | None = None


class ContractStatusResponse(BaseModel):
    as_of: datetime
    chain_key: Literal["sepolia", "amoy"]
    enabled_chain_keys: list[Literal["sepolia", "amoy"]] = Field(default_factory=list)
    chain_id: int
    contract_address: str | None = None
    explorer_base_url: str = ""
    window_days: int = 7
    gas: ContractStatusGasSnapshot
    successful_tx_count: int = 0
    pending_escrows_count: int = 0
    count: int = 0
    limit: int = 20
    offset: int = 0
    has_more: bool = False
    recent_successful_txs: list[ContractStatusTxItem] = Field(default_factory=list)


class OfflineOperation(BaseModel):
    operation_id: str
    idempotency_key: str
    entity_type: Literal[
        "reservation",
        "tour_reservation",
        "payment_submission",
        "checkin",
        "checkout",
        "service_request",
    ]
    action: str
    entity_id: str | None = None
    payload: dict = Field(default_factory=dict)
    created_at: datetime
    retry_count: int = Field(default=0, ge=0)


class SyncConflict(BaseModel):
    conflict: bool = False
    server_version: int | None = None
    resolution_hint: str | None = None
    detail: str | None = None


class SyncPushRequest(BaseModel):
    scope: Literal["me", "admin"] = "me"
    operations: list[OfflineOperation] = Field(default_factory=list)


class SyncPushItemResult(BaseModel):
    operation_id: str
    idempotency_key: str
    entity_type: str
    action: str
    status: Literal["applied", "conflict", "failed", "noop"]
    http_status: int = 200
    entity_id: str | None = None
    conflict: SyncConflict | None = None
    response_payload: dict = Field(default_factory=dict)
    error_code: str | None = None
    error_message: str | None = None


class SyncPushResult(BaseModel):
    accepted: int = 0
    applied: int = 0
    failed: int = 0
    conflict: int = 0
    noop: int = 0
    results: list[SyncPushItemResult] = Field(default_factory=list)
    as_of: datetime


class SyncPullEvent(BaseModel):
    cursor: int
    entity_type: str
    entity_id: str
    action: Literal["insert", "update", "delete"]
    version: int
    changed_at: datetime
    payload: dict = Field(default_factory=dict)


class SyncStateSnapshot(BaseModel):
    scope: Literal["me", "admin"]
    cursor: int
    next_cursor: int
    count: int
    has_more: bool = False
    items: list[SyncPullEvent] = Field(default_factory=list)
    as_of: datetime


class UploadQueueItem(BaseModel):
    upload_id: str
    operation_id: str
    entity_type: str
    entity_id: str
    field_name: str
    storage_bucket: str
    storage_path: str
    mime_type: str | None = None
    size_bytes: int | None = None
    checksum_sha256: str | None = None
    status: Literal["queued", "uploaded", "committed", "failed"] = "queued"
    failure_reason: str | None = None
    metadata: dict = Field(default_factory=dict)


class SyncUploadsCommitRequest(BaseModel):
    items: list[UploadQueueItem] = Field(default_factory=list)


class SyncUploadsCommitResponse(BaseModel):
    committed: int = 0
    failed: int = 0
    items: list[UploadQueueItem] = Field(default_factory=list)


class EscrowShadowCleanupRequest(BaseModel):
    chain_key: Literal["sepolia", "amoy"] | None = None
    limit: int = Field(default=100, ge=1, le=500)
    execute: bool = False


class EscrowShadowCleanupItem(BaseModel):
    reservation_id: str
    reservation_code: str
    escrow_state: str
    chain_key: str | None = None
    chain_tx_hash: str | None = None
    onchain_booking_id: str | None = None
    created_at: datetime | None = None


class EscrowShadowCleanupResponse(BaseModel):
    chain_key: str
    executed: bool
    candidate_count: int
    cleaned_count: int
    cleaned_reservation_ids: list[str] = Field(default_factory=list)
    candidates: list[EscrowShadowCleanupItem] = Field(default_factory=list)


class EscrowReconciliationMonitorResponse(BaseModel):
    enabled: bool
    running: bool
    interval_sec: int
    limit: int
    chain_key: str | None = None
    last_started_at: datetime | None = None
    last_finished_at: datetime | None = None
    last_success_at: datetime | None = None
    last_duration_ms: float | None = None
    runs_total: int
    consecutive_failures: int
    last_error: str | None = None
    last_summary: EscrowReconciliationSummary | None = None
    alert_thresholds: dict[str, int] = Field(default_factory=dict)
    alert_active: bool = False


class SessionRequest(BaseModel):
    supabase_access_token: str


class SessionResponse(BaseModel):
    session_id: str
    user: dict
