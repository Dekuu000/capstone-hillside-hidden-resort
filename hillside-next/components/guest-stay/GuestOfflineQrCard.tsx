"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { QrToken } from "../../../packages/shared/src/types";
import { qrTokenSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { loadLastIssuedQrToken, saveLastIssuedQrToken } from "../../lib/guestQrTokenCache";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { compactQrTokenPayload } from "../../lib/qrPayload";

type Props = {
  accessToken: string | null;
  reservationId: string;
  reservationCode: string;
};

export function GuestOfflineQrCard({ accessToken, reservationId, reservationCode }: Props) {
  const online = useNetworkOnline();
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<QrToken | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const attemptedOnlineIssueRef = useRef(false);

  const issueToken = useCallback(async () => {
    if (!accessToken || !online) return;
    setLoading(true);
    setError(null);
    try {
      const issued = await apiFetch<QrToken>(
        "/v2/qr/issue",
        { method: "POST", body: JSON.stringify({ reservation_id: reservationId }) },
        accessToken,
        qrTokenSchema,
      );
      setToken(issued);
      setFromCache(false);
      await saveLastIssuedQrToken({
        reservation_id: reservationId,
        reservation_code: reservationCode,
        token: issued,
        cached_at: new Date().toISOString(),
      });
    } catch (unknownError) {
      setError(getApiErrorMessage(unknownError, "Failed to prepare your check-in pass."));
    } finally {
      setLoading(false);
    }
  }, [accessToken, online, reservationCode, reservationId]);

  useEffect(() => {
    void loadLastIssuedQrToken(reservationId).then((cached) => {
      if (!cached?.token) return;
      setToken(cached.token);
      setFromCache(true);
    });
  }, [reservationId]);

  useEffect(() => {
    if (!online || !accessToken) return;
    if (attemptedOnlineIssueRef.current) return;
    attemptedOnlineIssueRef.current = true;
    void issueToken();
  }, [accessToken, issueToken, online]);

  useEffect(() => {
    if (!token?.expires_at) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(token.expires_at) - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [token?.expires_at]);

  return (
    <div className="text-center">
      <p className="text-sm text-[var(--color-muted)]">Show this code at the front desk to check in.</p>
      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
        Booking {reservationCode}
      </span>

      {!online ? (
        <p className="mx-auto mt-3 max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800">
          You&rsquo;re offline — showing your last saved pass. Reconnect to refresh it.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !token ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]" role="status">
          Preparing your pass…
        </p>
      ) : null}

      {token ? (
        <>
          <div className="mt-4 flex justify-center">
            <div className="rounded-3xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
              <QRCodeSVG value={JSON.stringify(compactQrTokenPayload(token))} size={256} level="M" includeMargin />
            </div>
          </div>
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Auto-refreshes to stay valid{secondsLeft != null ? ` · ${secondsLeft}s` : ""}
          </p>
          {fromCache ? (
            <p className="mt-1.5 text-xs font-semibold text-amber-700">Saved pass shown for offline use.</p>
          ) : null}
        </>
      ) : null}

      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={() => void issueToken()}
          className="guest-secondary-cta min-h-10 px-4 text-sm"
          disabled={loading || !online}
        >
          {online ? "Refresh now" : "Reconnect to refresh"}
        </button>
      </div>
    </div>
  );
}
