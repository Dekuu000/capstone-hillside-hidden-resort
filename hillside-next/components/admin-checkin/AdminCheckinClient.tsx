"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import type { CheckOperationResponse, QrToken, QrVerifyResponse } from "../../../packages/shared/src/types";
import { checkOperationResponseSchema, qrTokenSchema, qrVerifyResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";

type AdminCheckinClientProps = {
  initialToken?: string | null;
};

type PendingQrVerification = {
  id: string;
  queuedAt: string;
  scannerId: string;
  qrToken: QrToken;
};

const OFFLINE_QR_QUEUE_KEY = "hillside.admin.checkin.qrQueue.v1";
const CAMERA_READER_ID = "admin-checkin-qr-camera";

function pickPreferredCameraId(cameras: Array<{ id: string; label?: string }>): string {
  const preferred = cameras.find((camera) => /back|rear|environment/i.test(camera.label || ""));
  return (preferred || cameras[0]).id;
}

function loadOfflineQueue(): PendingQrVerification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_QR_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const qrToken = qrTokenSchema.safeParse((entry as { qrToken?: unknown }).qrToken);
        if (!qrToken.success) return null;
        return {
          id: String((entry as { id?: unknown }).id || crypto.randomUUID()),
          queuedAt: String((entry as { queuedAt?: unknown }).queuedAt || new Date().toISOString()),
          scannerId: String((entry as { scannerId?: unknown }).scannerId || "admin-v2-scanner"),
          qrToken: qrToken.data,
        } satisfies PendingQrVerification;
      })
      .filter((entry): entry is PendingQrVerification => Boolean(entry));
  } catch {
    return [];
  }
}

function persistOfflineQueue(items: PendingQrVerification[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OFFLINE_QR_QUEUE_KEY, JSON.stringify(items));
}

function isLikelyNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lowered = message.toLowerCase();
  return lowered.includes("failed to fetch") || lowered.includes("networkerror");
}

export function AdminCheckinClient({ initialToken = null }: AdminCheckinClientProps) {
  const token = initialToken;
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const scanHandledRef = useRef(false);

  const [scannerId, setScannerId] = useState("admin-v2-scanner");
  const [validateMode, setValidateMode] = useState<"code" | "token" | "scan">("code");
  const [reservationCode, setReservationCode] = useState("");
  const [qrTokenInput, setQrTokenInput] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);

  const [result, setResult] = useState<QrVerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"checkin" | "checkout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<PendingQrVerification[]>([]);

  useEffect(() => {
    setOfflineQueue(loadOfflineQueue());
  }, []);

  const enqueueOfflineQrToken = useCallback((qrToken: QrToken) => {
    setOfflineQueue((current) => {
      const deduped = current.filter((entry) => entry.qrToken.jti !== qrToken.jti);
      const next = [
        ...deduped,
        {
          id: crypto.randomUUID(),
          queuedAt: new Date().toISOString(),
          scannerId: scannerId.trim() || "admin-v2-scanner",
          qrToken,
        },
      ];
      persistOfflineQueue(next);
      return next;
    });
  }, [scannerId]);

  const clearOfflineQueue = useCallback(() => {
    setOfflineQueue([]);
    persistOfflineQueue([]);
  }, []);

  const validateByReservationCode = useCallback(
    async (code: string) => {
      if (!token) return;
      const data = await apiFetch<QrVerifyResponse>(
        "/v2/qr/verify",
        {
          method: "POST",
          body: JSON.stringify({
            reservation_code: code,
            scanner_id: scannerId.trim() || "admin-v2-scanner",
            offline_mode: false,
          }),
        },
        token,
        qrVerifyResponseSchema,
      );
      setResult(data);
    },
    [scannerId, token],
  );

  const validateByQrToken = useCallback(
    async (parsedToken: QrToken, allowOfflineQueue: boolean) => {
      if (!token) return;
      try {
        const data = await apiFetch<QrVerifyResponse>(
          "/v2/qr/verify",
          {
            method: "POST",
            body: JSON.stringify({
              qr_token: parsedToken,
              scanner_id: scannerId.trim() || "admin-v2-scanner",
              offline_mode: false,
            }),
          },
          token,
          qrVerifyResponseSchema,
        );
        setResult(data);
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : "Failed to validate reservation.";
        if (allowOfflineQueue && isLikelyNetworkError(unknownError)) {
          enqueueOfflineQrToken(parsedToken);
          setResult(null);
          setError(null);
          setNotice("Network unavailable. QR token queued. Reconnect and click Sync queued tokens.");
          return;
        }
        if (message.startsWith("HTTP 410")) {
          setResult(null);
          setError("QR token expired. Ask the guest to refresh the QR and scan again.");
          return;
        }
        setResult(null);
        setError(message);
      }
    },
    [enqueueOfflineQrToken, scannerId, token],
  );

  const validateScannedValue = useCallback(
    async (rawValue: string) => {
      const value = rawValue.trim();
      if (!value) {
        setError("Scanned QR is empty.");
        return;
      }
      setError(null);
      setNotice(null);

      try {
        const parsedToken = qrTokenSchema.parse(JSON.parse(value));
        setQrTokenInput(JSON.stringify(parsedToken, null, 2));
        await validateByQrToken(parsedToken, true);
        return;
      } catch {
        // Not a QR token payload; continue and treat as reservation code.
      }

      setReservationCode(value);
      try {
        await validateByReservationCode(value);
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : "Failed to validate reservation code.";
        setResult(null);
        setError(message);
      }
    },
    [validateByQrToken, validateByReservationCode],
  );

  const stopCameraScan = useCallback(async () => {
    const scanner = qrScannerRef.current;
    qrScannerRef.current = null;
    scanHandledRef.current = false;
    setScanActive(false);
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      // Ignore stop errors; clear below.
    }
    try {
      scanner.clear();
    } catch {
      // Ignore clear errors.
    }
  }, []);

  const startCameraScan = useCallback(async () => {
    setScanLoading(true);
    setError(null);
    setNotice(null);
    setScanMessage(null);
    setLastScanAt(null);

    await stopCameraScan();

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(CAMERA_READER_ID);
      qrScannerRef.current = scanner;
      scanHandledRef.current = false;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error("No camera detected. Connect a camera and retry.");
      }
      const cameraId = pickPreferredCameraId(cameras);
      if (!cameraId) {
        throw new Error("Camera ID unavailable. Retry scanner startup.");
      }

      const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;
      const scannerConfig = isMobileViewport
        ? { fps: 8, qrbox: { width: 220, height: 220 } }
        : { fps: 10, qrbox: { width: 260, height: 260 } };

      await scanner.start(
        cameraId,
        scannerConfig,
        (decodedText) => {
          if (scanHandledRef.current) return;
          scanHandledRef.current = true;
          setScanMessage("QR detected. Validating...");
          setLastScanAt(new Date().toLocaleTimeString());
          if (typeof window !== "undefined" && window.navigator.vibrate) {
            window.navigator.vibrate(80);
          }
          void (async () => {
            try {
              await validateScannedValue(decodedText);
              setScanMessage("QR processed. You can scan again.");
            } finally {
              await stopCameraScan();
            }
          })();
        },
        () => {
          // Ignore continuous decode noise while camera is active.
        },
      );

      setScanActive(true);
      setScanMessage("Camera ready. Point the guest QR code at the camera.");
    } catch (unknownError) {
      await stopCameraScan();
      const message = unknownError instanceof Error ? unknownError.message : "Unable to start camera scanner.";
      setError(message);
      setScanMessage(null);
    } finally {
      setScanLoading(false);
    }
  }, [stopCameraScan, validateScannedValue]);

  useEffect(() => {
    if (validateMode !== "scan") {
      setScanMessage(null);
      void stopCameraScan();
    }
  }, [stopCameraScan, validateMode]);

  useEffect(
    () => () => {
      void stopCameraScan();
    },
    [stopCameraScan],
  );

  const validateInput = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (validateMode === "code") {
        if (!reservationCode.trim()) {
          setError("Reservation code is required.");
          return;
        }
        await validateByReservationCode(reservationCode.trim());
        return;
      }

      if (validateMode === "scan") {
        if (!scanActive && !scanLoading) {
          setError("Start the camera scanner first.");
        }
        return;
      }

      if (!qrTokenInput.trim()) {
        setError("QR token JSON is required.");
        return;
      }

      let parsedToken: QrToken;
      try {
        const json = JSON.parse(qrTokenInput);
        parsedToken = qrTokenSchema.parse(json);
      } catch {
        setError("Invalid QR token JSON.");
        return;
      }
      await validateByQrToken(parsedToken, true);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to validate reservation.";
      setResult(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [qrTokenInput, reservationCode, scanActive, scanLoading, token, validateByQrToken, validateByReservationCode, validateMode]);

  const syncOfflineQueue = useCallback(async () => {
    if (!token) return;
    if (offlineQueue.length === 0) {
      setNotice("No queued QR tokens to sync.");
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    const queued = [...offlineQueue];
    let pending = [...queued];
    let synced = 0;
    let dropped = 0;
    let hasTerminalError = false;

    for (const entry of queued) {
      try {
        const data = await apiFetch<QrVerifyResponse>(
          "/v2/qr/verify",
          {
            method: "POST",
            body: JSON.stringify({
              qr_token: entry.qrToken,
              scanner_id: entry.scannerId || "admin-v2-scanner",
              offline_mode: true,
            }),
          },
          token,
          qrVerifyResponseSchema,
        );
        pending = pending.filter((item) => item.id !== entry.id);
        synced += 1;
        setResult(data);
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : String(unknownError ?? "");
        if (isLikelyNetworkError(unknownError)) {
          break;
        }
        if (
          message.startsWith("HTTP 401")
          || message.startsWith("HTTP 404")
          || message.startsWith("HTTP 409")
          || message.startsWith("HTTP 410")
          || message.startsWith("HTTP 422")
        ) {
          pending = pending.filter((item) => item.id !== entry.id);
          dropped += 1;
          continue;
        }

        setError(message || "Failed while syncing queued QR tokens.");
        hasTerminalError = true;
        break;
      }
    }

    setOfflineQueue(pending);
    persistOfflineQueue(pending);
    setLoading(false);

    if (!hasTerminalError) {
      setNotice(`Sync complete: ${synced} synced, ${dropped} dropped, ${pending.length} remaining.`);
    }
  }, [offlineQueue, token]);

  const performCheckin = useCallback(async () => {
    if (!token || !result) return;
    if (!result.allowed && result.can_override && overrideReason.trim().length < 5) {
      setError("Override reason is required (minimum 5 characters).");
      return;
    }

    setActionLoading("checkin");
    setError(null);
    setNotice(null);
    try {
      await apiFetch<CheckOperationResponse>(
        "/v2/checkins",
        {
          method: "POST",
          body: JSON.stringify({
            reservation_id: result.reservation_id,
            scanner_id: scannerId.trim() || "admin-v2-scanner",
            override_reason: result.can_override ? overrideReason.trim() : null,
          }),
        },
        token,
        checkOperationResponseSchema,
      );
      setNotice("Check-in recorded.");
      setOverrideReason("");
      if (result.reservation_code) {
        await validateByReservationCode(result.reservation_code);
      }
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to perform check-in.");
    } finally {
      setActionLoading(null);
    }
  }, [overrideReason, result, scannerId, token, validateByReservationCode]);

  const performCheckout = useCallback(async () => {
    if (!token || !result) return;
    setActionLoading("checkout");
    setError(null);
    setNotice(null);
    try {
      await apiFetch<CheckOperationResponse>(
        "/v2/checkouts",
        {
          method: "POST",
          body: JSON.stringify({
            reservation_id: result.reservation_id,
            scanner_id: scannerId.trim() || "admin-v2-scanner",
          }),
        },
        token,
        checkOperationResponseSchema,
      );
      setNotice("Check-out recorded.");
      if (result.reservation_code) {
        await validateByReservationCode(result.reservation_code);
      }
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to perform check-out.");
    } finally {
      setActionLoading(null);
    }
  }, [result, scannerId, token, validateByReservationCode]);

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-4xl">
        <h1 className="text-3xl font-bold text-slate-900">Check-in</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  const canOverride = Boolean(result?.can_override);
  const canCheckin = Boolean(result && (result.allowed || canOverride));
  const canCheckout = Boolean(result?.status && String(result.status).toLowerCase() === "checked_in");

  return (
    <section className="mx-auto w-full max-w-4xl">
      <header className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">Check-in</h1>
        <p className="mt-1 text-sm text-slate-600">Validate reservation QR/code and execute check-in/check-out using V2 APIs.</p>
      </header>

      <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setValidateMode("code")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              validateMode === "code" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            Reservation Code
          </button>
          <button
            type="button"
            onClick={() => setValidateMode("token")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              validateMode === "token" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            QR Token
          </button>
          <button
            type="button"
            onClick={() => setValidateMode("scan")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              validateMode === "scan" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            Scan QR
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {validateMode === "code" ? (
            <label className="grid gap-1 text-sm text-slate-700">
              Reservation Code
              <input
                type="text"
                value={reservationCode}
                onChange={(event) => setReservationCode(event.target.value)}
                placeholder="e.g., HR-20260220-ABCD"
                className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
              />
            </label>
          ) : validateMode === "token" ? (
            <label className="grid gap-1 text-sm text-slate-700 md:col-span-2">
              QR Token JSON
              <textarea
                value={qrTokenInput}
                onChange={(event) => setQrTokenInput(event.target.value)}
                placeholder='{"jti":"...","reservation_id":"...","expires_at":"...","signature":"...","rotation_version":1}'
                spellCheck={false}
                className="min-h-[120px] rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
              />
            </label>
          ) : (
            <div className="grid gap-2 md:col-span-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-700">Camera Scanner</p>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    scanActive
                      ? "bg-emerald-100 text-emerald-700"
                      : scanLoading
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {scanActive ? "Live" : scanLoading ? "Starting" : "Idle"}
                </span>
              </div>
              <div className="relative overflow-hidden rounded-xl border-2 border-blue-100 bg-slate-900/5">
                <div id={CAMERA_READER_ID} className="min-h-[300px] sm:min-h-[340px]" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[64%] w-[78%] rounded-2xl border-2 border-blue-400/80 bg-transparent" />
                </div>
              </div>
              <p className="text-xs text-slate-500">Allow camera access, then align the guest QR inside the frame.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void startCameraScan()}
                  disabled={scanLoading}
                  className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {scanLoading ? "Starting..." : scanActive ? "Restart camera" : "Start camera"}
                </button>
                <button
                  type="button"
                  onClick={() => void stopCameraScan()}
                  disabled={!scanActive}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Stop camera
                </button>
                <button
                  type="button"
                  onClick={() => setValidateMode("token")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  Paste token instead
                </button>
              </div>
              {scanMessage ? (
                <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">{scanMessage}</p>
              ) : null}
              {lastScanAt ? <p className="text-xs text-slate-500">Last scan: {lastScanAt}</p> : null}
            </div>
          )}
          <label className="grid gap-1 text-sm text-slate-700">
            Scanner ID
            <input
              type="text"
              value={scannerId}
              onChange={(event) => setScannerId(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          {validateMode !== "scan" ? (
            <button
              type="button"
              onClick={() => void validateInput()}
              disabled={loading}
              className="rounded-lg border border-blue-700 bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Validating..." : validateMode === "code" ? "Validate" : "Validate QR token"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void stopCameraScan();
              setReservationCode("");
              setQrTokenInput("");
              setOverrideReason("");
              setLastScanAt(null);
              setResult(null);
              setError(null);
              setNotice(null);
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Reset
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
            Queued tokens: {offlineQueue.length}
          </span>
          <button
            type="button"
            onClick={() => void syncOfflineQueue()}
            disabled={loading || offlineQueue.length === 0}
            className="rounded-lg border border-blue-700 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-40"
          >
            Sync queued tokens
          </button>
          <button
            type="button"
            onClick={clearOfflineQueue}
            disabled={offlineQueue.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
          >
            Clear queue
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}

      {result ? (
        <div className="mt-4 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Reservation Code</p>
              <p className="text-sm font-semibold text-slate-900">{result.reservation_code}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Reservation Status</p>
              <p className="text-sm font-semibold text-slate-900">{String(result.status || "-").replaceAll("_", " ")}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Guest</p>
              <p className="text-sm font-semibold text-slate-900">{result.guest_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Validation Result</p>
              <p className="text-sm font-semibold text-slate-900">{result.allowed ? "Allowed" : result.reason || "Blocked"}</p>
            </div>
          </div>

          {canOverride ? (
            <label className="mt-4 grid gap-1 text-sm text-slate-700">
              Override reason
              <textarea
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Enter reason for override."
                className="min-h-[90px] rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
              />
            </label>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void performCheckin()}
              disabled={!canCheckin || Boolean(actionLoading)}
              className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {actionLoading === "checkin" ? "Processing..." : canOverride ? "Check-in (Override)" : "Check-in"}
            </button>
            <button
              type="button"
              onClick={() => void performCheckout()}
              disabled={!canCheckout || Boolean(actionLoading)}
              className="rounded-lg border border-orange-600 bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {actionLoading === "checkout" ? "Processing..." : "Check-out"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
