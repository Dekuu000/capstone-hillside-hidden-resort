import type { QrToken } from "../../packages/shared/src/types";

export type CompactQrPayload = Pick<
  QrToken,
  "jti" | "reservation_id" | "reservation_code" | "expires_at" | "signature" | "rotation_version"
>;

export function compactQrTokenPayload(token: QrToken): CompactQrPayload {
  return {
    jti: token.jti,
    reservation_id: token.reservation_id,
    reservation_code: token.reservation_code,
    expires_at: token.expires_at,
    signature: token.signature,
    rotation_version: token.rotation_version,
  };
}
