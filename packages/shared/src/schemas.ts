import { z } from "zod";
import {
  ADMIN_PAYMENTS_TABS,
  BOOKING_STATUSES,
  CHAIN_KEYS,
  MY_BOOKINGS_TABS,
  UNIT_OPERATIONAL_STATUSES,
} from "./types";

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

export const escrowStateSchema = z.enum([
  "none",
  "pending_lock",
  "locked",
  "pending_release",
  "released",
  "refunded",
  "failed",
]);

export const escrowRefSchema = z.object({
  chain_key: z.enum(CHAIN_KEYS).optional(),
  chain_id: z.number().int().positive(),
  contract_address: z.string().min(3),
  tx_hash: z.string().min(3),
  event_index: z.number().int().min(0),
  state: escrowStateSchema,
});

export const qrTokenSchema = z.object({
  jti: z.string().uuid(),
  reservation_id: z.string().uuid(),
  reservation_code: z.string().min(1).optional().nullable(),
  expires_at: z.string().datetime(),
  signature: z.string().min(8),
  rotation_version: z.number().int().min(1),
  booking_hash: z.string().optional().nullable(),
  nft_token_id: z.number().int().optional().nullable(),
});

export const pricingRecommendationSchema = z.object({
  reservation_id: z.string().min(1),
  pricing_adjustment: z.number(),
  confidence: z.number().min(0).max(1),
  explanations: z.array(z.string()).default([]),
  suggested_multiplier: z.number().optional().nullable(),
  demand_bucket: z.enum(["low", "normal", "high"]).optional().nullable(),
  signal_breakdown: z
    .array(
      z.object({
        signal: z.string().min(1),
        value: z.number(),
        impact: z.number(),
      }),
    )
    .default([])
    .optional(),
  confidence_breakdown: z
    .object({
      model_fit_score: z.number().optional(),
      raw_confidence: z.number().optional(),
      final_confidence: z.number().optional(),
      zero_adjustment_penalty: z.number().optional(),
      predicted_adjustment: z.number().optional(),
      explained_sum: z.number().optional(),
      reconciliation_delta: z.number().optional(),
    })
    .nullable()
    .optional(),
});

export const aiLatencySummarySchema = z.object({
  count: z.number().int().nonnegative(),
  avg_ms: z.number().nonnegative(),
  p50_ms: z.number().nonnegative(),
  p95_ms: z.number().nonnegative(),
  last_ms: z.number().nonnegative(),
});

export const aiPricingMetricsResponseSchema = z.object({
  generated_at: z.string().datetime(),
  total_requests: z.number().int().nonnegative(),
  remote_success: z.number().int().nonnegative(),
  fallback_count: z.number().int().nonnegative(),
  fallback_rate: z.number().min(0).max(1),
  last_fallback_reason: z.string().optional().nullable(),
  last_fallback_at: z.string().datetime().optional().nullable(),
  latency_ms: aiLatencySummarySchema,
});

export const myBookingsTabSchema = z.enum(MY_BOOKINGS_TABS);

export const myBookingsCursorSchema = z.object({
  checkInDate: z.string().optional().nullable(),
  createdAt: z.string().min(1),
  reservationId: z.string().min(1),
});

export const reservationGuestSchema = z.object({
  name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

export const reservationUnitSchema = z.object({
  reservation_unit_id: z.string().min(1),
  quantity_or_nights: z.number(),
  rate_snapshot: z.number(),
  unit: z
    .object({
      name: z.string().optional().nullable(),
      unit_code: z.string().optional().nullable(),
      room_number: z.string().optional().nullable(),
      type: z.string().optional().nullable(),
      amenities: z.array(z.string()).optional().nullable(),
      image_url: z.string().optional().nullable(),
      image_urls: z.array(z.string()).optional().nullable(),
      image_thumb_urls: z.array(z.string()).optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const reservationServiceBookingSchema = z.object({
  service_booking_id: z.string().min(1),
  visit_date: z.string().optional().nullable(),
  total_amount: z.number(),
  adult_qty: z.number().optional().nullable(),
  kid_qty: z.number().optional().nullable(),
  service: z
    .object({
      service_name: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const reservationListItemSchema = z.object({
  reservation_id: z.string().min(1),
  reservation_code: z.string().min(1),
  status: bookingStatusSchema,
  reservation_source: z.enum(["online", "walk_in"]).optional(),
  created_at: z.string().min(1),
  check_in_date: z.string().min(1),
  check_out_date: z.string().min(1),
  total_amount: z.number(),
  amount_paid_verified: z.number().optional().nullable(),
  balance_due: z.number().optional().nullable(),
  deposit_required: z.number().optional().nullable(),
  expected_pay_now: z.number().optional().nullable(),
  guest_count: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
  escrow_state: z.string().optional().nullable(),
  chain_key: z.string().optional().nullable(),
  chain_id: z.number().int().optional().nullable(),
  escrow_contract_address: z.string().optional().nullable(),
  chain_tx_hash: z.string().optional().nullable(),
  onchain_booking_id: z.string().optional().nullable(),
  guest_pass_token_id: z.union([z.number(), z.string()]).optional().nullable(),
  guest_pass_tx_hash: z.string().optional().nullable(),
  guest_pass_chain_key: z.string().optional().nullable(),
  guest_pass_reservation_hash: z.string().optional().nullable(),
  guest: reservationGuestSchema.optional().nullable(),
  units: z.array(reservationUnitSchema).optional(),
  service_bookings: z.array(reservationServiceBookingSchema).optional(),
});

export const myBookingsResponseSchema = z.object({
  items: z.array(reservationListItemSchema),
  nextCursor: myBookingsCursorSchema.nullable(),
  totalCount: z.number().int().nonnegative(),
});

export const reservationListResponseSchema = z.object({
  items: z.array(reservationListItemSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export const reservationCancelResponseSchema = z.object({
  ok: z.literal(true),
  reservation_id: z.string().min(1),
  status: z.literal("cancelled"),
});

export const reservationStatusUpdateRequestSchema = z.object({
  status: bookingStatusSchema,
  notes: z.string().optional().nullable(),
});

export const reservationStatusUpdateResponseSchema = z.object({
  ok: z.literal(true),
  reservation: reservationListItemSchema,
});

export const adminPaymentsTabSchema = z.enum(ADMIN_PAYMENTS_TABS);

export const paymentStatusSchema = z.enum(["pending", "verified", "rejected"]);

export const paymentAdminUserSchema = z.object({
  user_id: z.string().min(1),
  name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
});

export const paymentReservationSummarySchema = z.object({
  reservation_code: z.string().min(1),
  status: bookingStatusSchema.optional().nullable(),
  reservation_source: z.enum(["online", "walk_in"]).optional().nullable(),
  total_amount: z.number().optional().nullable(),
  deposit_required: z.number().optional().nullable(),
  guest: z
    .object({
      name: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const adminPaymentItemSchema = z.object({
  payment_id: z.string().min(1),
  reservation_id: z.string().optional().nullable(),
  payment_type: z.string().min(1),
  amount: z.number(),
  method: z.string().min(1),
  reference_no: z.string().optional().nullable(),
  proof_url: z.string().optional().nullable(),
  status: paymentStatusSchema,
  verified_at: z.string().optional().nullable(),
  verified_by_admin_id: z.string().optional().nullable(),
  rejected_reason: z.string().optional().nullable(),
  rejected_at: z.string().optional().nullable(),
  rejected_by_admin_id: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
  reservation: paymentReservationSummarySchema.optional().nullable(),
  verified_admin: paymentAdminUserSchema.optional().nullable(),
  rejected_admin: paymentAdminUserSchema.optional().nullable(),
});

export const adminPaymentsResponseSchema = z.object({
  items: z.array(adminPaymentItemSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export const paymentVerifyResponseSchema = z.object({
  ok: z.literal(true),
  payment_id: z.string().min(1),
  status: z.literal("verified"),
});

export const paymentSubmissionRequestSchema = z.object({
  reservation_id: z.string().min(1),
  amount: z.number().positive(),
  payment_type: z.string().min(1),
  method: z.string().min(1),
  reference_no: z.string().optional().nullable(),
  proof_url: z.string().optional().nullable(),
  idempotency_key: z.string().min(1),
});

export const paymentSubmissionResponseSchema = z.object({
  payment_id: z.string().min(1),
  status: z.string().min(1),
  reservation_status: z.string().min(1),
});

export const paymentRejectResponseSchema = z.object({
  ok: z.literal(true),
  payment_id: z.string().min(1),
  status: z.literal("rejected"),
  reason: z.string().min(5),
});

export const onSitePaymentRequestSchema = z.object({
  reservation_id: z.string().min(1),
  amount: z.number().positive(),
  method: z.string().min(1),
  reference_no: z.string().optional().nullable(),
  idempotency_key: z.string().min(1).optional().nullable(),
});

export const onSitePaymentResponseSchema = z.object({
  ok: z.literal(true),
  payment_id: z.string().min(1),
  status: z.string().min(1),
  reservation_status: z.string().min(1),
});

export const serviceItemSchema = z.object({
  service_id: z.string().min(1),
  service_name: z.string().min(1),
  service_type: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  adult_rate: z.number().optional().nullable(),
  kid_rate: z.number().optional().nullable(),
  max_pax: z.number().int().optional().nullable(),
  description: z.string().optional().nullable(),
});

export const serviceListResponseSchema = z.object({
  items: z.array(serviceItemSchema),
  count: z.number().int().nonnegative(),
});

export const availableUnitsResponseSchema = z.object({
  items: z.array(
    z.object({
      unit_id: z.string().min(1),
      name: z.string().min(1),
      unit_code: z.string().optional().nullable(),
      room_number: z.string().optional().nullable(),
      type: z.string().min(1),
      description: z.string().optional().nullable(),
      base_price: z.number(),
      capacity: z.number().int(),
      is_active: z.boolean().optional().nullable(),
      image_url: z.string().optional().nullable(),
      image_urls: z.array(z.string()).optional().nullable(),
      image_thumb_urls: z.array(z.string()).optional().nullable(),
      amenities: z.array(z.string()).optional().nullable(),
      created_at: z.string().optional().nullable(),
      updated_at: z.string().optional().nullable(),
    }),
  ),
  count: z.number().int().nonnegative(),
  check_in_date: z.string().min(1),
  check_out_date: z.string().min(1),
});

export const walkInStayCreateRequestSchema = z.object({
  check_in_date: z.string().min(1),
  check_out_date: z.string().min(1),
  unit_ids: z.array(z.string().min(1)).min(1),
  guest_name: z.string().optional().nullable(),
  guest_phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  expected_pay_now: z.number().nonnegative().optional().nullable(),
  idempotency_key: z.string().min(1).optional().nullable(),
});

export const reservationCreateRequestSchema = z.object({
  check_in_date: z.string().min(1),
  check_out_date: z.string().min(1),
  unit_ids: z.array(z.string().min(1)).min(1),
  guest_count: z.number().int().positive(),
  idempotency_key: z.string().min(1),
});

export const reservationCreateResponseSchema = z.object({
  reservation_id: z.string().min(1),
  reservation_code: z.string().min(1),
  status: bookingStatusSchema,
  escrow_ref: escrowRefSchema.optional().nullable(),
  ai_recommendation: pricingRecommendationSchema.optional().nullable(),
});

export const tourReservationCreateRequestSchema = z.object({
  service_id: z.string().min(1),
  visit_date: z.string().min(1),
  adult_qty: z.number().int().nonnegative(),
  kid_qty: z.number().int().nonnegative(),
  is_advance: z.boolean().optional().default(true),
  expected_pay_now: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  idempotency_key: z.string().min(1).optional().nullable(),
});

export const reportSummarySchema = z.object({
  bookings: z.number(),
  cancellations: z.number(),
  cash_collected: z.number(),
  occupancy_rate: z.number(),
  unit_booked_value: z.number(),
  tour_booked_value: z.number(),
});

export const reportDailyItemSchema = z.object({
  report_date: z.string().min(1),
  bookings: z.number(),
  cancellations: z.number(),
  cash_collected: z.number(),
  occupancy_rate: z.number(),
  unit_booked_value: z.number(),
  tour_booked_value: z.number(),
});

export const reportMonthlyItemSchema = z.object({
  report_month: z.string().min(1),
  bookings: z.number(),
  cancellations: z.number(),
  cash_collected: z.number(),
  occupancy_rate: z.number(),
  unit_booked_value: z.number(),
  tour_booked_value: z.number(),
});

export const reportsOverviewResponseSchema = z.object({
  from_date: z.string().min(1),
  to_date: z.string().min(1),
  summary: reportSummarySchema,
  daily: z.array(reportDailyItemSchema),
  monthly: z.array(reportMonthlyItemSchema),
});

export const dashboardSummaryMetricsSchema = z.object({
  active_units: z.number().int().nonnegative(),
  for_verification: z.number().int().nonnegative(),
  pending_payments: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
});

export const dashboardSummaryResponseSchema = z.object({
  from_date: z.string().min(1),
  to_date: z.string().min(1),
  metrics: dashboardSummaryMetricsSchema,
  summary: reportSummarySchema,
});

export const resortSnapshotOccupancySchema = z.object({
  occupied_units: z.number().int().nonnegative(),
  active_units: z.number().int().nonnegative(),
  occupancy_rate: z.number().min(0).max(1),
});

export const resortSnapshotRevenueSchema = z.object({
  fiat_php_7d: z.number().nonnegative(),
  crypto_native_total: z.number().nonnegative(),
  crypto_tx_count: z.number().int().nonnegative(),
  crypto_chain_key: z.string().min(1),
  crypto_unit: z.string().min(1),
});

export const resortSnapshotAiDemandItemSchema = z.object({
  date: z.string().min(1),
  occupancy_pct: z.number().int().nonnegative().max(100),
});

export const resortSnapshotAiDemandSchema = z.object({
  status: z.enum(["ready", "stale", "missing"]),
  model_version: z.string().nullable(),
  avg_occupancy_pct: z.number().int().nonnegative().max(100),
  peak_occupancy_pct: z.number().int().nonnegative().max(100),
  peak_date: z.string().nullable(),
  items: z.array(resortSnapshotAiDemandItemSchema),
});

export const resortSnapshotResponseSchema = z.object({
  as_of: z.string().min(1),
  occupancy: resortSnapshotOccupancySchema,
  revenue: resortSnapshotRevenueSchema,
  ai_demand_7d: resortSnapshotAiDemandSchema,
});

export const qrVerifyResponseSchema = z.object({
  reservation_id: z.string().min(1),
  reservation_code: z.string().min(1),
  guest_name: z.string().optional().nullable(),
  status: z.string().optional(),
  allowed: z.boolean(),
  can_override: z.boolean().optional(),
  reason: z.string().optional().nullable(),
  scanner_id: z.string().min(1),
  offline_mode: z.boolean(),
});

export const checkOperationResponseSchema = z.object({
  ok: z.literal(true),
  reservation_id: z.string().min(1),
  status: z.enum(["checked_in", "checked_out"]),
  scanner_id: z.string().optional().nullable(),
  escrow_release_state: z.enum(["released", "pending_release", "skipped"]).optional().nullable(),
  welcome_notification: z
    .object({
      created: z.boolean(),
      notification_id: z.string().optional().nullable(),
      fallback_used: z.boolean().optional().default(false),
      model_version: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const checkOperationRequestSchema = z.object({
  reservation_id: z.string().min(1),
  scanner_id: z.string().optional().nullable(),
  override_reason: z.string().optional().nullable(),
  idempotency_key: z.string().min(1).optional().nullable(),
});

export const welcomeSuggestionItemSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  reasons: z.array(z.string()).default([]).optional(),
});

export const welcomeNotificationSchema = z.object({
  notification_id: z.string().min(1),
  reservation_id: z.string().min(1),
  guest_user_id: z.string().min(1),
  event_type: z.literal("checkin_welcome"),
  title: z.string().min(1),
  message: z.string().min(1),
  suggestions: z.array(welcomeSuggestionItemSchema).default([]),
  model_version: z.string().optional().nullable(),
  source: z.string().min(1),
  fallback_used: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  created_at: z.string().datetime(),
  read_at: z.string().datetime().optional().nullable(),
});

export const stayDashboardResponseSchema = z.object({
  reservation: reservationListItemSchema.nullable(),
  welcome_notification: welcomeNotificationSchema.nullable(),
});

export const escrowReleaseRetryRequestSchema = z.object({
  reservation_id: z.string().min(1),
});

export const escrowReleaseRetryResponseSchema = z.object({
  ok: z.boolean(),
  reservation_id: z.string().min(1),
  escrow_state: z.enum(["released", "pending_release", "locked", "skipped"]),
  tx_hash: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
});

export const auditLogItemSchema = z.object({
  audit_id: z.string().min(1),
  performed_by_user_id: z.string().optional().nullable(),
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  action: z.string().min(1),
  data_hash: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  blockchain_tx_hash: z.string().optional().nullable(),
  anchor_id: z.string().optional().nullable(),
  timestamp: z.string().min(1),
  performed_by: z
    .object({
      name: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export const auditLogsResponseSchema = z.object({
  items: z.array(auditLogItemSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export const contractStatusGasSnapshotSchema = z.object({
  base_fee_gwei: z.number().nullable().optional(),
  priority_fee_gwei: z.number().nullable().optional(),
  source: z.enum(["live", "cached", "unavailable"]),
  stale: z.boolean(),
  last_updated_at: z.string().datetime().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const contractStatusTxItemSchema = z.object({
  reservation_id: z.string().min(1),
  reservation_code: z.string().min(1),
  escrow_state: z.enum(["locked", "released", "refunded", "pending_lock", "pending_release", "failed"]),
  chain_tx_hash: z.string().min(1),
  onchain_booking_id: z.string().nullable().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});

export const contractStatusResponseSchema = z.object({
  as_of: z.string().datetime(),
  chain_key: z.enum(CHAIN_KEYS),
  enabled_chain_keys: z.array(z.enum(CHAIN_KEYS)).optional(),
  chain_id: z.number().int(),
  contract_address: z.string().nullable().optional(),
  explorer_base_url: z.string(),
  window_days: z.number().int().min(1).max(30),
  gas: contractStatusGasSnapshotSchema,
  successful_tx_count: z.number().int().nonnegative(),
  pending_escrows_count: z.number().int().nonnegative(),
  // Backward-compatible defaults so older API payloads still parse.
  count: z.number().int().nonnegative().optional().default(0),
  limit: z.number().int().positive().optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
  has_more: z.boolean().optional().default(false),
  recent_successful_txs: z.array(contractStatusTxItemSchema),
});

export const offlineOperationSchema = z.object({
  operation_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  entity_type: z.enum([
    "reservation",
    "tour_reservation",
    "payment_submission",
    "checkin",
    "checkout",
    "service_request",
  ]),
  action: z.string().min(1),
  entity_id: z.string().optional().nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().datetime(),
  retry_count: z.number().int().nonnegative().default(0),
});

export const syncConflictSchema = z.object({
  conflict: z.boolean(),
  server_version: z.number().int().optional().nullable(),
  resolution_hint: z.string().optional().nullable(),
  detail: z.string().optional().nullable(),
});

export const syncPushRequestSchema = z.object({
  scope: z.enum(["me", "admin"]).default("me"),
  operations: z.array(offlineOperationSchema).default([]),
});

export const syncPushItemResultSchema = z.object({
  operation_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  entity_type: z.string().min(1),
  action: z.string().min(1),
  status: z.enum(["applied", "conflict", "failed", "noop"]),
  http_status: z.number().int().nonnegative(),
  entity_id: z.string().optional().nullable(),
  conflict: syncConflictSchema.optional().nullable(),
  response_payload: z.record(z.string(), z.unknown()).default({}),
  error_code: z.string().optional().nullable(),
  error_message: z.string().optional().nullable(),
});

export const syncPushResultSchema = z.object({
  accepted: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  noop: z.number().int().nonnegative(),
  results: z.array(syncPushItemResultSchema),
  as_of: z.string().datetime(),
});

export const syncPullEventSchema = z.object({
  cursor: z.number().int().nonnegative(),
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  action: z.enum(["insert", "update", "delete"]),
  version: z.number().int().nonnegative(),
  changed_at: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const syncStateSnapshotSchema = z.object({
  scope: z.enum(["me", "admin"]),
  cursor: z.number().int().nonnegative(),
  next_cursor: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  has_more: z.boolean(),
  items: z.array(syncPullEventSchema),
  as_of: z.string().datetime(),
});

export const uploadQueueItemSchema = z.object({
  upload_id: z.string().min(1),
  operation_id: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  field_name: z.string().min(1),
  storage_bucket: z.string().min(1),
  storage_path: z.string().min(1),
  mime_type: z.string().optional().nullable(),
  size_bytes: z.number().int().nonnegative().optional().nullable(),
  checksum_sha256: z.string().optional().nullable(),
  status: z.enum(["queued", "uploaded", "committed", "failed"]),
  failure_reason: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const syncUploadsCommitRequestSchema = z.object({
  items: z.array(uploadQueueItemSchema).default([]),
});

export const syncUploadsCommitResponseSchema = z.object({
  committed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  items: z.array(uploadQueueItemSchema),
});

export const offlineSnapshotMetaSchema = z.object({
  cached_at: z.string().datetime(),
  scope: z.enum(["me", "admin"]),
  source_cursor: z.number().int().nonnegative().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

export const bookingsSnapshotSchema = offlineSnapshotMetaSchema.extend({
  data: myBookingsResponseSchema,
});

export const reservationsSnapshotSchema = offlineSnapshotMetaSchema.extend({
  data: reservationListResponseSchema,
});

export const dashboardSnapshotSchema = offlineSnapshotMetaSchema.extend({
  data: dashboardSummaryResponseSchema,
});

export const mapSnapshotAmenitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  x: z.number(),
  y: z.number(),
  kind: z.enum(["trail", "facility"]),
});

export const mapSnapshotSchema = offlineSnapshotMetaSchema.extend({
  data: z.object({
    amenities: z.array(mapSnapshotAmenitySchema),
  }),
});

export const unitItemSchema = z.object({
  unit_id: z.string().min(1),
  name: z.string().min(1),
  unit_code: z.string().min(1),
  room_number: z.string().optional().nullable(),
  type: z.string().min(1),
  description: z.string().optional().nullable(),
  base_price: z.number(),
  capacity: z.number().int(),
  is_active: z.boolean(),
  operational_status: z.enum(UNIT_OPERATIONAL_STATUSES).optional().default("cleaned"),
  image_url: z.string().optional().nullable(),
  image_urls: z.array(z.string()).optional().nullable(),
  image_thumb_urls: z.array(z.string()).optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

export const unitListResponseSchema = z.object({
  items: z.array(unitItemSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export const unitStatusUpdateResponseSchema = z.object({
  ok: z.literal(true),
  unit: unitItemSchema,
});

export const unitCreateRequestSchema = z.object({
  name: z.string().min(1),
  unit_code: z.string().min(1),
  room_number: z.string().optional().nullable(),
  type: z.enum(["room", "cottage", "amenity"]),
  description: z.string().optional().nullable(),
  base_price: z.number().nonnegative(),
  capacity: z.number().int().positive(),
  is_active: z.boolean().optional(),
  operational_status: z.enum(UNIT_OPERATIONAL_STATUSES).optional(),
  image_url: z.string().optional().nullable(),
  image_urls: z.array(z.string()).optional().nullable(),
  image_thumb_urls: z.array(z.string()).optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
});

export const unitUpdateRequestSchema = unitCreateRequestSchema.partial();

export const unitWriteResponseSchema = z.object({
  ok: z.literal(true),
  unit: unitItemSchema,
});

export const unitDeleteResponseSchema = z.object({
  ok: z.literal(true),
  unit_id: z.string().min(1),
  is_active: z.literal(false),
});

export const myProfileResponseSchema = z.object({
  user_id: z.string().min(1),
  email: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  wallet_address: z.string().optional().nullable(),
  wallet_chain: z.string().optional().nullable(),
});

export const myProfilePatchRequestSchema = z.object({
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  wallet_address: z.string().optional().nullable(),
  wallet_chain: z.string().optional().nullable(),
});

export const resortServiceCategorySchema = z.enum(["room_service", "spa"]);
export const resortServiceRequestStatusSchema = z.enum(["new", "in_progress", "done", "cancelled"]);

export const resortServiceItemSchema = z.object({
  service_item_id: z.string().min(1),
  category: resortServiceCategorySchema,
  service_name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.number(),
  eta_minutes: z.number().int().optional().nullable(),
  is_active: z.boolean(),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

export const resortServiceListResponseSchema = z.object({
  items: z.array(resortServiceItemSchema),
  count: z.number().int().nonnegative(),
});

export const resortServiceRequestItemSchema = z.object({
  request_id: z.string().min(1),
  guest_user_id: z.string().min(1),
  reservation_id: z.string().optional().nullable(),
  service_item_id: z.string().min(1),
  quantity: z.number().int().positive(),
  preferred_time: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: resortServiceRequestStatusSchema,
  requested_at: z.string().min(1),
  processed_at: z.string().optional().nullable(),
  processed_by_user_id: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
  guest: reservationGuestSchema.optional().nullable(),
  reservation: paymentReservationSummarySchema.optional().nullable(),
  service_item: resortServiceItemSchema.optional().nullable(),
});

export const resortServiceRequestListResponseSchema = z.object({
  items: z.array(resortServiceRequestItemSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export const resortServiceRequestCreateRequestSchema = z.object({
  service_item_id: z.string().min(1),
  reservation_id: z.string().optional().nullable(),
  quantity: z.number().int().positive().default(1),
  preferred_time: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  idempotency_key: z.string().min(1).optional().nullable(),
});

export const resortServiceRequestStatusPatchRequestSchema = z.object({
  status: resortServiceRequestStatusSchema,
  notes: z.string().optional().nullable(),
});

export const reportTransactionItemSchema = z.object({
  payment_id: z.string().min(1),
  reservation_code: z.string().optional().nullable(),
  amount: z.number(),
  status: z.string().min(1),
  method: z.string().min(1),
  payment_type: z.string().min(1),
  created_at: z.string().min(1),
  verified_at: z.string().optional().nullable(),
});

export const reportTransactionsResponseSchema = z.object({
  items: z.array(reportTransactionItemSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
});

export const escrowReconciliationItemSchema = z.object({
  reservation_id: z.string().min(1),
  reservation_code: z.string().min(1),
  db_escrow_state: escrowStateSchema,
  chain_key: z.enum(CHAIN_KEYS).optional().nullable(),
  chain_id: z.number().int().optional().nullable(),
  chain_tx_hash: z.string().optional().nullable(),
  onchain_booking_id: z.string().optional().nullable(),
  onchain_state: z.enum(["none", "locked", "released", "refunded"]).optional().nullable(),
  onchain_amount_wei: z.string().optional().nullable(),
  reservation_updated_at: z.string().datetime().optional().nullable(),
  result: z.enum(["match", "mismatch", "missing_onchain", "skipped"]),
  reason: z.string().optional().nullable(),
});

export const escrowReconciliationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  match: z.number().int().nonnegative(),
  mismatch: z.number().int().nonnegative(),
  missing_onchain: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  alert: z.boolean(),
});

export const escrowReconciliationResponseSchema = z.object({
  items: z.array(escrowReconciliationItemSchema),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  has_more: z.boolean(),
  summary: escrowReconciliationSummarySchema,
  cached: z.boolean().optional(),
  in_progress: z.boolean().optional(),
  last_reconciled_at: z.string().datetime().optional().nullable(),
});
