import { apiFetch } from "../apiClient";

/**
 * Start a PayMongo GCash hosted checkout for a freshly-created reservation and
 * full-page redirect to it. If the gateway is unavailable (PAYMENT_MODE!=gateway,
 * not configured, or any error), fall back to the manual payment page so the
 * guest is never dead-ended.
 */
export async function redirectToGcashOrPay(
  reservationId: string,
  token: string,
  fallbackToPay: (reservationId: string) => void,
): Promise<void> {
  try {
    const res = await apiFetch<{ checkout_url?: string }>(
      "/v2/payments/paymongo/checkout",
      { method: "POST", body: JSON.stringify({ reservation_id: reservationId }) },
      token,
    );
    if (res?.checkout_url) {
      window.location.assign(res.checkout_url);
      return;
    }
  } catch {
    // gateway disabled / not configured / transient error → manual pay page
  }
  fallbackToPay(reservationId);
}
