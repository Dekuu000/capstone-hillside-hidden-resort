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
export type ReservationCancellationActor = "guest" | "admin";
export type ReservationPolicyOutcome = "released" | "refunded" | "forfeited";
export type ReservationPolicyMetadata = {
  deposit_policy_version?: string | null;
  deposit_rule_applied?: string | null;
  cancellation_actor?: ReservationCancellationActor | null;
  policy_outcome?: ReservationPolicyOutcome | null;
};
export type ReservationPaymentPolicyMetadata = ReservationPolicyMetadata & {
  deposit_required?: number | null;
  expected_pay_now?: number | null;
};

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
  | "pending_release"
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
  reservation_code?: string | null;
  expires_at: string;
  signature: string;
  rotation_version: number;
  booking_hash?: string | null;
  nft_token_id?: number | null;
};

export type PricingRecommendation = {
  reservation_id: string;
  pricing_adjustment: number;
  confidence: number;
  explanations: string[];
  suggested_multiplier?: number | null;
  demand_bucket?: "low" | "normal" | "high" | null;
  signal_breakdown?: Array<{
    signal: string;
    value: number;
    impact: number;
  }>;
  confidence_breakdown?: {
    model_fit_score?: number;
    raw_confidence?: number;
    final_confidence?: number;
    zero_adjustment_penalty?: number;
    predicted_adjustment?: number;
    explained_sum?: number;
    reconciliation_delta?: number;
  } | null;
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
    unit_code?: string | null;
    room_number?: string | null;
    type?: string | null;
    amenities?: string[] | null;
    image_url?: string | null;
    image_urls?: string[] | null;
    image_thumb_urls?: string[] | null;
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

export type ReservationListItem = ReservationPaymentPolicyMetadata & {
  reservation_id: string;
  reservation_code: string;
  status: ReservationStatus;
  reservation_source?: "online" | "walk_in";
  created_at: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  amount_paid_verified?: number | null;
  balance_due?: number | null;
  guest_count?: number | null;
  notes?: string | null;
  updated_at?: string | null;
  escrow_state?: string | null;
  chain_key?: string | null;
  chain_id?: number | null;
  escrow_contract_address?: string | null;
  chain_tx_hash?: string | null;
  onchain_booking_id?: string | null;
  guest_pass_token_id?: number | string | null;
  guest_pass_tx_hash?: string | null;
  guest_pass_chain_key?: string | null;
  guest_pass_reservation_hash?: string | null;
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
} & ReservationPolicyMetadata;

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

export type PaymentReservationSummary = ReservationPolicyMetadata & {
  reservation_code: string;
  status?: ReservationStatus | null;
  reservation_source?: "online" | "walk_in" | null;
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

export type PaymentSubmissionRequest = {
  reservation_id: string;
  amount: number;
  payment_type: string;
  method: string;
  reference_no?: string | null;
  proof_url?: string | null;
  idempotency_key: string;
};

export type PaymentSubmissionResponse = {
  payment_id: string;
  status: string;
  reservation_status: ReservationStatus | string;
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
  idempotency_key?: string | null;
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

export type AvailableUnitsResponse = {
  items: Array<{
    unit_id: string;
    name: string;
    unit_code?: string | null;
    room_number?: string | null;
    type: string;
    description?: string | null;
    base_price: number;
    capacity: number;
    is_active?: boolean | null;
    image_url?: string | null;
    image_urls?: string[] | null;
    image_thumb_urls?: string[] | null;
    amenities?: string[] | null;
    created_at?: string | null;
    updated_at?: string | null;
  }>;
  count: number;
  check_in_date: string;
  check_out_date: string;
};

export type WalkInStayCreateRequest = {
  check_in_date: string;
  check_out_date: string;
  unit_ids: string[];
  guest_name?: string | null;
  guest_phone?: string | null;
  notes?: string | null;
  expected_pay_now?: number | null;
  idempotency_key?: string | null;
};

export type ReservationCreateRequest = {
  check_in_date: string;
  check_out_date: string;
  unit_ids: string[];
  guest_count: number;
  idempotency_key: string;
};

export type ReservationCreateResponse = ReservationPaymentPolicyMetadata & {
  reservation_id: string;
  reservation_code: string;
  status: ReservationStatus;
  escrow_ref?: EscrowRef | null;
  ai_recommendation?: PricingRecommendation | null;
};

export type TourReservationCreateRequest = {
  service_id: string;
  visit_date: string;
  adult_qty: number;
  kid_qty: number;
  is_advance?: boolean;
  expected_pay_now?: number | null;
  notes?: string | null;
  idempotency_key?: string | null;
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

export type ResortSnapshotOccupancy = {
  occupied_units: number;
  active_units: number;
  occupancy_rate: number;
};

export type ResortSnapshotRevenue = {
  fiat_php_7d: number;
  crypto_native_total: number;
  crypto_tx_count: number;
  crypto_chain_key: ChainKey | string;
  crypto_unit: string;
};

export type ResortSnapshotAiDemandItem = {
  date: string;
  occupancy_pct: number;
};

export type ResortSnapshotAiDemand = {
  status: "ready" | "stale" | "missing";
  model_version: string | null;
  avg_occupancy_pct: number;
  peak_occupancy_pct: number;
  peak_date: string | null;
  items: ResortSnapshotAiDemandItem[];
};

export type ResortSnapshotResponse = {
  as_of: string;
  occupancy: ResortSnapshotOccupancy;
  revenue: ResortSnapshotRevenue;
  ai_demand_7d: ResortSnapshotAiDemand;
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
  escrow_release_state?: "released" | "pending_release" | "skipped" | null;
  welcome_notification?: {
    created: boolean;
    notification_id?: string | null;
    fallback_used?: boolean;
    model_version?: string | null;
  } | null;
};

export type CheckOperationRequest = {
  reservation_id: string;
  scanner_id?: string | null;
  override_reason?: string | null;
  idempotency_key?: string | null;
};

export type WelcomeSuggestionItem = {
  code: string;
  title: string;
  description?: string | null;
  reasons?: string[];
};

export type WelcomeNotification = {
  notification_id: string;
  reservation_id: string;
  guest_user_id: string;
  event_type: "checkin_welcome";
  title: string;
  message: string;
  suggestions: WelcomeSuggestionItem[];
  model_version?: string | null;
  source: string;
  fallback_used: boolean;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  read_at?: string | null;
};

export type StayDashboardResponse = {
  reservation: ReservationListItem | null;
  welcome_notification: WelcomeNotification | null;
};

export type EscrowReleaseRetryRequest = {
  reservation_id: string;
};

export type EscrowReleaseRetryResponse = {
  ok: boolean;
  reservation_id: string;
  escrow_state: "released" | "pending_release" | "locked" | "skipped";
  tx_hash?: string | null;
  message?: string | null;
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

export type ContractStatusGasSnapshot = {
  base_fee_gwei?: number | null;
  priority_fee_gwei?: number | null;
  source: "live" | "cached" | "unavailable";
  stale: boolean;
  last_updated_at?: string | null;
  note?: string | null;
};

export type ContractStatusTxItem = {
  reservation_id: string;
  reservation_code: string;
  escrow_state: "locked" | "released" | "refunded" | "pending_lock" | "pending_release" | "failed";
  chain_tx_hash: string;
  onchain_booking_id?: string | null;
  updated_at?: string | null;
};

export type ContractStatusResponse = {
  as_of: string;
  chain_key: ChainKey;
  enabled_chain_keys?: ChainKey[];
  chain_id: number;
  contract_address?: string | null;
  explorer_base_url: string;
  window_days: number;
  gas: ContractStatusGasSnapshot;
  successful_tx_count: number;
  pending_escrows_count: number;
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
  recent_successful_txs: ContractStatusTxItem[];
};

export type OfflineOperation = {
  operation_id: string;
  idempotency_key: string;
  entity_type:
    | "reservation"
    | "tour_reservation"
    | "payment_submission"
    | "checkin"
    | "checkout"
    | "service_request";
  action: string;
  entity_id?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  retry_count: number;
};

export type SyncConflict = {
  conflict: boolean;
  server_version?: number | null;
  resolution_hint?: string | null;
  detail?: string | null;
};

export type SyncPushRequest = {
  scope?: "me" | "admin";
  operations: OfflineOperation[];
};

export type SyncPushItemResult = {
  operation_id: string;
  idempotency_key: string;
  entity_type: string;
  action: string;
  status: "applied" | "conflict" | "failed" | "noop";
  http_status: number;
  entity_id?: string | null;
  conflict?: SyncConflict | null;
  response_payload: Record<string, unknown>;
  error_code?: string | null;
  error_message?: string | null;
};

export type SyncPushResult = {
  accepted: number;
  applied: number;
  failed: number;
  conflict: number;
  noop: number;
  results: SyncPushItemResult[];
  as_of: string;
};

export type SyncPullEvent = {
  cursor: number;
  entity_type: string;
  entity_id: string;
  action: "insert" | "update" | "delete";
  version: number;
  changed_at: string;
  payload: Record<string, unknown>;
};

export type SyncStateSnapshot = {
  scope: "me" | "admin";
  cursor: number;
  next_cursor: number;
  count: number;
  has_more: boolean;
  items: SyncPullEvent[];
  as_of: string;
};

export type UploadQueueItem = {
  upload_id: string;
  operation_id: string;
  entity_type: string;
  entity_id: string;
  field_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  checksum_sha256?: string | null;
  status: "queued" | "uploaded" | "committed" | "failed";
  failure_reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SyncUploadsCommitRequest = {
  items: UploadQueueItem[];
};

export type SyncUploadsCommitResponse = {
  committed: number;
  failed: number;
  items: UploadQueueItem[];
};

export type OfflineSnapshotMeta = {
  cached_at: string;
  scope: "me" | "admin";
  source_cursor?: number | null;
  expires_at?: string | null;
};

export type BookingsSnapshot = OfflineSnapshotMeta & {
  data: MyBookingsResponse;
};

export type ReservationsSnapshot = OfflineSnapshotMeta & {
  data: ReservationListResponse;
};

export type DashboardSnapshot = OfflineSnapshotMeta & {
  data: DashboardSummaryResponse;
};

export type MapSnapshotAmenity = {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  kind: "trail" | "facility";
};

export type MapSnapshot = OfflineSnapshotMeta & {
  data: {
    amenities: MapSnapshotAmenity[];
  };
};

export type MyProfileResponse = {
  user_id: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  wallet_address?: string | null;
  wallet_chain?: string | null;
};

export type MyProfilePatchRequest = {
  name?: string | null;
  phone?: string | null;
  wallet_address?: string | null;
  wallet_chain?: string | null;
};

export type ResortServiceCategory = "room_service" | "spa";
export type ResortServiceRequestStatus = "new" | "in_progress" | "done" | "cancelled";

export type ResortServiceItem = {
  service_item_id: string;
  category: ResortServiceCategory;
  service_name: string;
  description?: string | null;
  price: number;
  eta_minutes?: number | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ResortServiceListResponse = {
  items: ResortServiceItem[];
  count: number;
};

export type ResortServiceRequestItem = {
  request_id: string;
  guest_user_id: string;
  reservation_id?: string | null;
  service_item_id: string;
  quantity: number;
  preferred_time?: string | null;
  notes?: string | null;
  status: ResortServiceRequestStatus;
  requested_at: string;
  processed_at?: string | null;
  processed_by_user_id?: string | null;
  updated_at?: string | null;
  guest?: ReservationGuest | null;
  reservation?: PaymentReservationSummary | null;
  service_item?: ResortServiceItem | null;
};

export type ResortServiceRequestListResponse = {
  items: ResortServiceRequestItem[];
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type ResortServiceRequestCreateRequest = {
  service_item_id: string;
  reservation_id?: string | null;
  quantity: number;
  preferred_time?: string | null;
  notes?: string | null;
  idempotency_key?: string | null;
};

export type ResortServiceRequestStatusPatchRequest = {
  status: ResortServiceRequestStatus;
  notes?: string | null;
};

export const UNIT_OPERATIONAL_STATUSES = [
  "cleaned",
  "occupied",
  "maintenance",
  "dirty",
] as const;

export type UnitOperationalStatus = (typeof UNIT_OPERATIONAL_STATUSES)[number];

export type UnitItem = {
  unit_id: string;
  name: string;
  unit_code: string;
  room_number?: string | null;
  type: string;
  description?: string | null;
  base_price: number;
  capacity: number;
  is_active: boolean;
  operational_status?: UnitOperationalStatus;
  image_url?: string | null;
  image_urls?: string[] | null;
  image_thumb_urls?: string[] | null;
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
  unit_code: string;
  room_number?: string | null;
  type: "room" | "cottage" | "amenity";
  description?: string | null;
  base_price: number;
  capacity: number;
  is_active?: boolean;
  operational_status?: UnitOperationalStatus;
  image_url?: string | null;
  image_urls?: string[] | null;
  image_thumb_urls?: string[] | null;
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
  reservation_updated_at?: string | null;
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
  cached?: boolean;
  in_progress?: boolean;
  last_reconciled_at?: string | null;
};
