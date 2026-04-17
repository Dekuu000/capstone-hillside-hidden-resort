"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, RefreshCcw, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { QrToken } from "../../../packages/shared/src/types";
import { qrTokenSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { loadLastIssuedQrToken, saveLastIssuedQrToken } from "../../lib/guestQrTokenCache";
import { compactQrTokenPayload } from "../../lib/qrPayload";
import { StatusPill } from "../shared/StatusPill";
import { useToast } from "../shared/ToastProvider";

type Props = {
  accessToken: string | null;
  reservationId: string;
  reservationCode: string;
};

export function GuestOfflineQrCard({ accessToken, reservationId, reservationCode }: Props) {
  const { showToast } = useToast();
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<QrToken | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const attemptedOnlineIssueRef = useRef(false);

  useEffect(() => {
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

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
      setError(unknownError instanceof Error ? unknownError.message : "Failed to issue check-in token.");
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

  const copyPayload = useCallback(async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(compactQrTokenPayload(token), null, 2));
      showToast({ type: "success", title: "Copied", message: "Token payload copied." });
    } catch {
      showToast({ type: "warning", title: "Copy failed", message: "Clipboard access is not available." });
    }
  }, [showToast, token]);

  return (
    <article className="surface p-5 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Check-in QR (Offline-ready)</h2>
        <StatusPill
          label={online ? "Online" : "Offline"}
          tone={online ? "success" : "warn"}
          icon={online ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
        />
      </div>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Last issued token is cached for offline display. New token issuance still requires internet.
      </p>
      {fromCache ? (
        <p className="mt-2 text-xs text-amber-700">Offline display: showing last cached token.</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p> : null}
      {!token ? (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--color-border)] bg-slate-50 p-4 text-sm text-[var(--color-muted)]">
          No cached token yet. Connect online and tap <span className="font-semibold text-[var(--color-text)]">Refresh token</span> once.
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--color-text)]">Reservation {reservationCode}</p>
            <p className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {secondsLeft != null ? `Expires in ${secondsLeft}s` : "Expiry unavailable"}
            </p>
          </div>
          <div className="mt-3 flex justify-center rounded-xl border border-[var(--color-border)] bg-white p-3">
            <QRCodeSVG value={JSON.stringify(compactQrTokenPayload(token))} size={300} level="M" includeMargin />
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void issueToken()}
          disabled={!online || loading || !accessToken}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {loading ? "Refreshing..." : online ? "Refresh token" : "Reconnect to refresh"}
        </button>
        <button
          type="button"
          onClick={() => void copyPayload()}
          disabled={!token}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Copy payload
        </button>
      </div>
    </article>
  );
}

