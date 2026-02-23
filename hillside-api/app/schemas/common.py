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


class EscrowRef(BaseModel):
    chain_key: Literal["sepolia", "amoy"] | None = None
    chain_id: int
    contract_address: str
    tx_hash: str
    event_index: int
    state: Literal["pending", "locked", "released", "refunded", "failed"]


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
    expires_at: datetime
    signature: str
    rotation_version: int


class AiRecommendation(BaseModel):
    reservation_id: str
    pricing_adjustment: float
    confidence: float = Field(ge=0.0, le=1.0)
    explanations: list[str]


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
    idempotency_key: str


class ReservationResponse(BaseModel):
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
    type: str
    description: str | None = None
    base_price: float
    capacity: int
    is_active: bool
    image_url: str | None = None
    image_urls: list[str] | None = None
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


class UnitCreateRequest(BaseModel):
    name: str
    type: Literal["room", "cottage", "amenity"]
    description: str | None = None
    base_price: float = Field(ge=0)
    capacity: int = Field(ge=1)
    is_active: bool = True
    image_url: str | None = None
    image_urls: list[str] | None = None
    amenities: list[str] | None = None


class UnitUpdateRequest(BaseModel):
    name: str | None = None
    type: Literal["room", "cottage", "amenity"] | None = None
    description: str | None = None
    base_price: float | None = Field(default=None, ge=0)
    capacity: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    image_url: str | None = None
    image_urls: list[str] | None = None
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


class ReservationGuestSummary(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None


class ReservationUnitInfo(BaseModel):
    name: str | None = None
    amenities: list[str] | None = None
    image_url: str | None = None
    image_urls: list[str] | None = None


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


class ReservationListItem(BaseModel):
    reservation_id: str
    reservation_code: str
    status: BookingStatus
    created_at: datetime
    check_in_date: date
    check_out_date: date
    total_amount: float
    amount_paid_verified: float | None = None
    balance_due: float | None = None
    deposit_required: float | None = None
    expected_pay_now: float | None = None
    notes: str | None = None
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


class CancelReservationResponse(BaseModel):
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


class PaymentReservationSummary(BaseModel):
    reservation_code: str
    status: BookingStatus | None = None
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


class OnSitePaymentResponse(BaseModel):
    ok: bool = True
    payment_id: str
    status: str
    reservation_status: str


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
