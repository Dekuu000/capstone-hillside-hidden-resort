export function normalizePaymentProofPath(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.includes("/payment-proofs/")) {
    return trimmed.split("/payment-proofs/")[1] ?? trimmed;
  }
  return trimmed;
}
