import { z } from "zod";
import {
  ADMIN_PAYMENTS_TABS,
  BOOKING_STATUSES,
  CHAIN_KEYS,
  MY_BOOKINGS_TABS,
} from "./types";

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

export const escrowStateSchema = z.enum([
  "none",
  "pending_lock",
  "locked",
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
  expires_at: z.string().datetime(),
  signature: z.string().min(8),
  rotation_version: z.number().int().min(1),
});

export const pricingRecommendationSchema = z.object({
  reservation_id: z.string().uuid(),
  pricing_adjustment: z.number(),
  confidence: z.number().min(0).max(1),
  explanations: z.array(z.string()).default([]),
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
      amenities: z.array(z.string()).optional().nullable(),
      image_url: z.string().optional().nullable(),
      image_urls: z.array(z.string()).optional().nullable(),
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
  created_at: z.string().min(1),
  check_in_date: z.string().min(1),
  check_out_date: z.string().min(1),
  total_amount: z.number(),
  amount_paid_verified: z.number().optional().nullable(),
  balance_due: z.number().optional().nullable(),
  deposit_required: z.number().optional().nullable(),
  expected_pay_now: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
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

export const reservationCreateResponseSchema = z.object({
  reservation_id: z.string().min(1),
  reservation_code: z.string().min(1),
  status: bookingStatusSchema,
  escrow_ref: escrowRefSchema.optional().nullable(),
  ai_recommendation: pricingRecommendationSchema.optional().nullable(),
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

export const unitItemSchema = z.object({
  unit_id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional().nullable(),
  base_price: z.number(),
  capacity: z.number().int(),
  is_active: z.boolean(),
  image_url: z.string().optional().nullable(),
  image_urls: z.array(z.string()).optional().nullable(),
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
  type: z.enum(["room", "cottage", "amenity"]),
  description: z.string().optional().nullable(),
  base_price: z.number().nonnegative(),
  capacity: z.number().int().positive(),
  is_active: z.boolean().optional(),
  image_url: z.string().optional().nullable(),
  image_urls: z.array(z.string()).optional().nullable(),
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
});
