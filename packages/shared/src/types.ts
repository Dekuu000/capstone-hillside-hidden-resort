export const BOOKING_STATUSES = [
  "draft",
  "pending_payment",
  "escrow_locked",
  "for_verification",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type ReservationStatus = BookingStatus;

export const CHAIN_KEYS = ["sepolia", "amoy"] as const;
export type ChainKey = (typeof CHAIN_KEYS)[number];

export const MY_BOOKINGS_TABS = [
  "upcoming",
  "pending_payment",
  "completed",
  "cancelled",
] as const;

export type MyBookingsTab = (typeof MY_BOOKINGS_TABS)[number];

export type EscrowState =
  | "none"
  | "pending_lock"
  | "locked"
  | "released"
  | "refunded"
  | "failed";

export type EscrowRef = {
  chain_key?: ChainKey;
  chain_id: number;
  contract_address: string;
  tx_hash: string;
  event_index: number;
  state: EscrowState;
};

export type QrToken = {
  jti: string;
  reservation_id: string;
  expires_at: string;
  signature: string;
  rotation_version: number;
};

export type PricingRecommendation = {
  reservation_id: string;
  pricing_adjustment: number;
  confidence: number;
  explanations: string[];
};

export type AiLatencySummary = {
  count: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  last_ms: number;
};

export type AiPricingMetricsResponse = {
  generated_at: string;
  total_requests: number;
  remote_success: number;
  fallback_count: number;
  fallback_rate: number;
  last_fallback_reason?: string | null;
  last_fallback_at?: string | null;
  latency_ms: AiLatencySummary;
};

export type MyBookingsCursor = {
  checkInDate?: string | null;
  createdAt: string;
  reservationId: string;
};

export type ReservationGuest = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type ReservationUnit = {
  reservation_unit_id: string;
  quantity_or_nights: number;
  rate_snapshot: number;
  unit?: {
    name?: string | null;
    amenities?: string[] | null;
    image_url?: string | null;
    image_urls?: string[] | null;
  } | null;
};

export type ReservationServiceBooking = {
  service_booking_id: string;
  visit_date?: string | null;
  total_amount: number;
  adult_qty?: number | null;
  kid_qty?: number | null;
  service?: {
    service_name?: string | null;
  } | null;
};

export type ReservationListItem = {
  reservation_id: string;
  reservation_code: string;
  status: ReservationStatus;
  created_at: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  amount_paid_verified?: number | null;
  balance_due?: number | null;
  deposit_required?: number | null;
  expected_pay_now?: number | null;
  notes?: string | null;
  guest?: ReservationGuest | null;
  units?: ReservationUnit[];
  service_bookings?: ReservationServiceBooking[];
};

export type MyBookingsResponse = {
  items: ReservationListItem[];
  nextCursor: MyBookingsCursor | null;
  totalCount: number;
};

export type ReservationListResponse = {
  items: ReservationListItem[];
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type ReservationCancelResponse = {
  ok: true;
  reservation_id: string;
  status: "cancelled";
};

export type ReservationStatusUpdateRequest = {
  status: ReservationStatus;
  notes?: string | null;
};

export type ReservationStatusUpdateResponse = {
  ok: true;
  reservation: ReservationListItem;
};

export const ADMIN_PAYMENTS_TABS = [
  "to_review",
  "verified",
  "rejected",
  "all",
] as const;

export type AdminPaymentsTab = (typeof ADMIN_PAYMENTS_TABS)[number];

export type PaymentStatus = "pending" | "verified" | "rejected";

export type PaymentAdminUser = {
  user_id: string;
  name?: string | null;
  email?: string | null;
};

export type PaymentReservationSummary = {
  reservation_code: string;
  status?: ReservationStatus | null;
  total_amount?: number | null;
  deposit_required?: number | null;
  guest?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

export type AdminPaymentItem = {
  payment_id: string;
  reservation_id?: string | null;
  payment_type: string;
  amount: number;
  method: string;
  reference_no?: string | null;
  proof_url?: string | null;
  status: PaymentStatus;
  verified_at?: string | null;
  verified_by_admin_id?: string | null;
  rejected_reason?: string | null;
  rejected_at?: string | null;
  rejected_by_admin_id?: string | null;
  created_at?: string | null;
  reservation?: PaymentReservationSummary | null;
  verified_admin?: PaymentAdminUser | null;
  rejected_admin?: PaymentAdminUser | null;
};

export type AdminPaymentsResponse = {
  items: AdminPaymentItem[];
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type PaymentVerifyResponse = {
  ok: true;
  payment_id: string;
  status: "verified";
};

export type PaymentRejectResponse = {
  ok: true;
  payment_id: string;
  status: "rejected";
  reason: string;
};

export type OnSitePaymentRequest = {
  reservation_id: string;
  amount: number;
  method: string;
  reference_no?: string | null;
};

export type OnSitePaymentResponse = {
  ok: true;
  payment_id: string;
  status: string;
  reservation_status: ReservationStatus | string;
};

export type ServiceItem = {
  service_id: string;
  service_name: string;
  service_type?: string | null;
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  adult_rate?: number | null;
  kid_rate?: number | null;
  max_pax?: number | null;
  description?: string | null;
};

export type ServiceListResponse = {
  items: ServiceItem[];
  count: number;
};

export type ReservationCreateResponse = {
  reservation_id: string;
  reservation_code: string;
  status: ReservationStatus;
  escrow_ref?: EscrowRef | null;
  ai_recommendation?: PricingRecommendation | null;
};

export type ReportSummary = {
  bookings: number;
  cancellations: number;
  cash_collected: number;
  occupancy_rate: number;
  unit_booked_value: number;
  tour_booked_value: number;
};

export type ReportDailyItem = {
  report_date: string;
  bookings: number;
  cancellations: number;
  cash_collected: number;
  occupancy_rate: number;
  unit_booked_value: number;
  tour_booked_value: number;
};

export type ReportMonthlyItem = {
  report_month: string;
  bookings: number;
  cancellations: number;
  cash_collected: number;
  occupancy_rate: number;
  unit_booked_value: number;
  tour_booked_value: number;
};

export type ReportsOverviewResponse = {
  from_date: string;
  to_date: string;
  summary: ReportSummary;
  daily: ReportDailyItem[];
  monthly: ReportMonthlyItem[];
};

export type DashboardSummaryMetrics = {
  active_units: number;
  for_verification: number;
  pending_payments: number;
  confirmed: number;
};

export type DashboardSummaryResponse = {
  from_date: string;
  to_date: string;
  metrics: DashboardSummaryMetrics;
  summary: ReportSummary;
};

export type QrVerifyResponse = {
  reservation_id: string;
  reservation_code: string;
  guest_name?: string | null;
  status?: ReservationStatus | string;
  allowed: boolean;
  can_override?: boolean;
  reason?: string | null;
  scanner_id: string;
  offline_mode: boolean;
};

export type CheckOperationResponse = {
  ok: true;
  reservation_id: string;
  status: "checked_in" | "checked_out";
  scanner_id?: string | null;
};

export type AuditLogItem = {
  audit_id: string;
  performed_by_user_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  data_hash: string;
  metadata?: Record<string, unknown> | null;
  blockchain_tx_hash?: string | null;
  anchor_id?: string | null;
  timestamp: string;
  performed_by?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

export type AuditLogsResponse = {
  items: AuditLogItem[];
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type UnitItem = {
  unit_id: string;
  name: string;
  type: string;
  description?: string | null;
  base_price: number;
  capacity: number;
  is_active: boolean;
  image_url?: string | null;
  image_urls?: string[] | null;
  amenities?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UnitListResponse = {
  items: UnitItem[];
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type UnitStatusUpdateResponse = {
  ok: true;
  unit: UnitItem;
};

export type UnitCreateRequest = {
  name: string;
  type: "room" | "cottage" | "amenity";
  description?: string | null;
  base_price: number;
  capacity: number;
  is_active?: boolean;
  image_url?: string | null;
  image_urls?: string[] | null;
  amenities?: string[] | null;
};

export type UnitUpdateRequest = Partial<UnitCreateRequest>;

export type UnitWriteResponse = {
  ok: true;
  unit: UnitItem;
};

export type UnitDeleteResponse = {
  ok: true;
  unit_id: string;
  is_active: false;
};

export type ReportTransactionItem = {
  payment_id: string;
  reservation_code?: string | null;
  amount: number;
  status: string;
  method: string;
  payment_type: string;
  created_at: string;
  verified_at?: string | null;
};

export type ReportTransactionsResponse = {
  items: ReportTransactionItem[];
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type EscrowReconciliationResult =
  | "match"
  | "mismatch"
  | "missing_onchain"
  | "skipped";

export type EscrowReconciliationItem = {
  reservation_id: string;
  reservation_code: string;
  db_escrow_state: EscrowState;
  chain_key?: ChainKey | null;
  chain_id?: number | null;
  chain_tx_hash?: string | null;
  onchain_booking_id?: string | null;
  onchain_state?: "none" | "locked" | "released" | "refunded" | null;
  onchain_amount_wei?: string | null;
  result: EscrowReconciliationResult;
  reason?: string | null;
};

export type EscrowReconciliationSummary = {
  total: number;
  match: number;
  mismatch: number;
  missing_onchain: number;
  skipped: number;
  alert: boolean;
};

export type EscrowReconciliationResponse = {
  items: EscrowReconciliationItem[];
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
  summary: EscrowReconciliationSummary;
};
