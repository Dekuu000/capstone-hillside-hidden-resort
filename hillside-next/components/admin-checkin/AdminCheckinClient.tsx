"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import {
  CloudOff,
  Keyboard,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type {
  CheckOperationResponse,
  QrPublicKeyResponse,
  QrToken,
  QrVerifyResponse,
  ReservationListResponse,
  ReservationListItem as ReservationItem,
  SyncPushResult,
} from "../../../packages/shared/src/types";
import {
  checkOperationResponseSchema,
  qrPublicKeyResponseSchema,
  qrTokenSchema,
  qrVerifyResponseSchema,
  reservationListResponseSchema,
  reservationListItemSchema,
  syncPushResultSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { clearEncryptedQueue, loadEncryptedQueue, saveEncryptedQueue } from "../../lib/secureOfflineQueue";
import { loadTodayArrivalsCache, saveTodayArrivalsCache, type CachedArrival } from "../../lib/checkinOfflineCache";
import {
  cacheQrPublicKey,
  loadCachedQrPublicKey,
  markQrJtiUsed,
  verifyQrTokenLocally,
  type TokenLocalVerdict,
} from "../../lib/qrLocalVerify";
import { Skeleton } from "../shared/Skeleton";
import { ResultBanner } from "../shared/ResultBanner";
import { StatusPill } from "../shared/StatusPill";
import { useToast } from "../shared/ToastProvider";
import { CameraScanPanel } from "../checkin/CameraScanPanel";
import { ScanHeader } from "../checkin/ScanHeader";
import { ScanSegmentedControl, type ScanMode } from "../checkin/ScanSegmentedControl";
import { SettingsDrawer } from "../checkin/SettingsDrawer";
import { DataFreshnessBadge } from "../shared/DataFreshnessBadge";

type Props = {
  initialToken?: string | null;
  initialMode?: ScanMode;
  tabletView?: boolean;
  initialReservationCode?: string;
};
type Mode = ScanMode;
type Outcome = "ready" | "scanning" | "valid" | "invalid" | "queued";
type LocalValidation = "valid" | "invalid" | "expired" | "blocked" | "unknown";
type QueueSyncStatus = "pending" | "synced" | "failed";
type QueuedAction = {
  id: string;
  actionType: "checkin" | "checkout";
  reservationId: string;
  reservationCode: string;
  overrideReason: string | null;
  tokenJti: string | null;
  validatedAt: string;
  queuedAt: string;
  source: "scan" | "code";
  localValidation: LocalValidation;
  localVerdict: "allowed" | "blocked";
  syncStatus: QueueSyncStatus;
  syncMessage: string | null;
  syncHint: string | null;
  syncHttpStatus: number | null;
};
type SyncReportItem = {
  id: string;
  queuedId?: string;
  label: string;
  outcome: "validated" | "blocked" | "queued" | "synced" | "failed" | "error";
  message: string;
  at: string;
  verifyResult?: QrVerifyResponse;
};

const CAMERA_READER_ID = "admin-checkin-qr-camera";
const SCAN_HINTS = [
  "Hold QR 15-25 cm from camera and fill most of the frame.",
  "Increase lighting and avoid strong backlight.",
  "Hold steady for one second when code is centered.",
];

function pickPreferredCameraId(cameras: Array<{ id: string; label?: string }>): string {
  const preferred = cameras.find((camera) => /back|rear|environment/i.test(camera.label || ""));
  return (preferred || cameras[0]).id;
}

function normalizeOfflineQueue(items: unknown[]): QueuedAction[] {
  const normalized: QueuedAction[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const actionTypeRaw = String((entry as { actionType?: unknown }).actionType || "").toLowerCase();
    const actionType: "checkin" | "checkout" = actionTypeRaw === "checkout" ? "checkout" : "checkin";
    const reservationId = String((entry as { reservationId?: unknown }).reservationId || "").trim();
    const reservationCode = String((entry as { reservationCode?: unknown }).reservationCode || "").trim();
    if (!reservationId || !reservationCode) continue;
    const syncRaw = String((entry as { syncStatus?: unknown }).syncStatus || "").toLowerCase();
    const syncStatus: QueueSyncStatus = syncRaw === "synced" ? "synced" : syncRaw === "failed" ? "failed" : "pending";
    const localRaw = String((entry as { localValidation?: unknown }).localValidation || "").toLowerCase();
    const localValidation: LocalValidation = ["valid", "invalid", "expired", "blocked", "unknown"].includes(localRaw)
      ? (localRaw as LocalValidation)
      : "unknown";
    normalized.push({
      id: String((entry as { id?: unknown }).id || crypto.randomUUID()),
      actionType,
      reservationId,
      reservationCode,
      overrideReason: String((entry as { overrideReason?: unknown }).overrideReason || "").trim() || null,
      tokenJti: String((entry as { tokenJti?: unknown }).tokenJti || "") || null,
      validatedAt: String((entry as { validatedAt?: unknown }).validatedAt || (entry as { queuedAt?: unknown }).queuedAt || new Date().toISOString()),
      queuedAt: String((entry as { queuedAt?: unknown }).queuedAt || new Date().toISOString()),
      source: (String((entry as { source?: unknown }).source || "").toLowerCase() === "scan" ? "scan" : "code"),
      localValidation,
      localVerdict: (String((entry as { localVerdict?: unknown }).localVerdict || "").toLowerCase() === "allowed" ? "allowed" : "blocked"),
      syncStatus,
      syncMessage: String((entry as { syncMessage?: unknown }).syncMessage || "") || null,
      syncHint: String((entry as { syncHint?: unknown }).syncHint || "").trim() || null,
      syncHttpStatus:
        typeof (entry as { syncHttpStatus?: unknown }).syncHttpStatus === "number"
          ? ((entry as { syncHttpStatus?: number }).syncHttpStatus ?? null)
          : null,
    });
  }
  return normalized;
}

function isLikelyNetworkError(error: unknown): boolean {
  const message = String(error ?? "");
  const lowered = message.toLowerCase();
  return (
    lowered.includes("failed to fetch") ||
    lowered.includes("networkerror") ||
    lowered.includes("network request failed") ||
    lowered.startsWith("offline:")
  );
}

function pendingLabel(item: QueuedAction): string {
  return item.reservationCode;
}

function friendlyInvalidReason(reason?: string | null, fallback?: string | null): string {
  const source = (reason || fallback || "").toLowerCase();
  if (source.includes("expired") || source.includes("http 410")) return "Token expired. Ask guest to refresh QR.";
  if (source.includes("replay") || source.includes("used") || source.includes("consumed") || source.includes("http 409")) {
    return "Token already used. Ask guest to show a fresh QR.";
  }
  if (reason && reason.trim().length > 0) return reason;
  return "Validation failed. Please rescan.";
}

function friendlyCheckinFailure(error: unknown, currentStatus?: string | null): string {
  const message = getApiErrorMessage(error, "Check-in failed.");
  const lowered = message.toLowerCase();
  if (String(currentStatus || "").toLowerCase() === "checked_in") return "Reservation is already checked in.";
  if (lowered.includes("already checked in") || lowered.includes("http 409")) return "Reservation is already checked in.";
  if (
    lowered.includes("failed to fetch") ||
    lowered.includes("networkerror") ||
    lowered.includes("network error") ||
    lowered.startsWith("offline:")
  ) {
    return "Network error. Please check connection and try again.";
  }
  return message || "Check-in failed.";
}

const BUSINESS_TIMEZONE = "Asia/Manila";

function dateKeyInBusinessTz(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function todayDateKey() {
  return dateKeyInBusinessTz(new Date());
}

function plusDaysDateKey(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKeyInBusinessTz(date);
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildCachedArrivalSignatureHash(cached: CachedArrival): Promise<string> {
  const payload = [
    cached.reservation_id,
    cached.reservation_code,
    cached.check_in_date || "",
    cached.check_out_date || "",
    cached.status || "",
    cached.signed_token?.jti || "",
    cached.signed_token?.signature || "",
    String(cached.signed_token?.rotation_version || ""),
  ].join("|");
  return sha256Hex(payload);
}

function buildDetailFromCache(cached: CachedArrival): ReservationItem {
  return {
    reservation_id: cached.reservation_id,
    reservation_code: cached.reservation_code,
    created_at: cached.cached_at,
    check_in_date: cached.check_in_date || todayDateKey(),
    check_out_date: cached.check_out_date || cached.check_in_date || todayDateKey(),
    status: (cached.status || "confirmed") as ReservationItem["status"],
    total_amount: Number(cached.total_amount ?? 0),
    amount_paid_verified: Number(cached.amount_paid_verified ?? 0),
    balance_due: Number(cached.balance_due ?? 0),
    deposit_required: 0,
    expected_pay_now: 0,
    notes: "Offline cache snapshot",
    guest: cached.guest_name ? { name: cached.guest_name, email: null } : null,
    units: [],
    service_bookings: [],
  };
}

function evaluateOfflineArrival(cached: CachedArrival): { allowed: boolean; reason?: string; canOverride?: boolean } {
  const today = todayDateKey();
  const status = String(cached.status || "").toLowerCase();
  if (cached.check_in_date && cached.check_in_date !== today) {
    return { allowed: false, reason: "Check-in allowed only on the reservation date." };
  }
  if (status === "checked_in") return { allowed: false, reason: "Reservation already checked in." };
  if (status === "checked_out") return { allowed: false, reason: "Reservation already checked out." };
  if (status === "cancelled" || status === "no_show") return { allowed: false, reason: "Reservation is not active." };
  const balance = Number(cached.balance_due ?? 0);
  if (Number.isFinite(balance) && balance > 0) {
    return { allowed: false, reason: "Payment required before check-in.", canOverride: true };
  }
  return { allowed: true };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const CHECKIN_DISPLAY_LOCALE = "en-US";
const CHECKIN_DISPLAY_TIMEZONE = "Asia/Manila";

function formatDateTimeInline(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat(CHECKIN_DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: CHECKIN_DISPLAY_TIMEZONE,
  }).format(parsed);
}

function formatTimeInline(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat(CHECKIN_DISPLAY_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: CHECKIN_DISPLAY_TIMEZONE,
  }).format(parsed);
}

function formatPeso(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

function findScrollableParent(element: HTMLElement | null): HTMLElement | null {
  let parent = element?.parentElement ?? null;
  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    const canScroll = (overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight;
    if (canScroll) return parent;
    parent = parent.parentElement;
  }
  return null;
}

function smoothScrollToElement(element: HTMLElement, durationMs = 450) {
  const container = findScrollableParent(element);
  const start = container ? container.scrollTop : window.scrollY;
  const targetRect = element.getBoundingClientRect();
  const containerTop = container ? container.getBoundingClientRect().top : 0;
  const target = container
    ? start + targetRect.top - containerTop - 16
    : window.scrollY + targetRect.top - 16;
  const delta = target - start;
  if (Math.abs(delta) < 2) return;

  let startAt = 0;
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  const tick = (time: number) => {
    if (!startAt) startAt = time;
    const progress = Math.min((time - startAt) / durationMs, 1);
    const nextY = start + delta * easeOutCubic(progress);
    if (container) {
      container.scrollTop = nextY;
    } else {
      window.scrollTo({ top: nextY, left: 0, behavior: "auto" });
    }
    if (progress < 1) window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

function tryPlaySuccessTone(enabled: boolean) {
  if (!enabled) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
  } catch {}
}

export function AdminCheckinClient({
  initialToken = null,
  initialMode = "scan",
  tabletView = false,
  initialReservationCode = "",
}: Props) {
  const token = initialToken;
  const { showToast } = useToast();
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const scanHandledRef = useRef(false);
  const scanPulseTimeoutRef = useRef<number | null>(null);
  const resultCardRef = useRef<HTMLElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const preloadBusyRef = useRef(false);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [outcome, setOutcome] = useState<Outcome>("ready");
  const [scanPulse, setScanPulse] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label?: string }>>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [scanHintsVisible, setScanHintsVisible] = useState(false);
  const [scanHintIndex, setScanHintIndex] = useState(0);
  const [enableSuccessSound, setEnableSuccessSound] = useState(true);
  const [enableVibrate, setEnableVibrate] = useState(true);
  const [scannerId, setScannerId] = useState("admin-v2-scanner");
  const [reservationCode, setReservationCode] = useState(initialReservationCode);
  const [tokenFallbackInput, setTokenFallbackInput] = useState("");
  const [showTokenFallback, setShowTokenFallback] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState<string | null>(null);
  const [tokenSecondsLeft, setTokenSecondsLeft] = useState<number | null>(null);
  const [qrPublicKey, setQrPublicKey] = useState<string | null>(null);
  const [tokenVerdict, setTokenVerdict] = useState<TokenLocalVerdict | "unknown">("unknown");
  const [tokenVerdictReason, setTokenVerdictReason] = useState<string | null>(null);
  const [activeTokenJti, setActiveTokenJti] = useState<string | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [result, setResult] = useState<QrVerifyResponse | null>(null);
  const [detail, setDetail] = useState<ReservationItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [syncReport, setSyncReport] = useState<SyncReportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queueWriteBusy, setQueueWriteBusy] = useState(false);
  const [preloadBusy, setPreloadBusy] = useState(false);
  const [autoRefreshPack, setAutoRefreshPack] = useState(true);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null);
  const [cacheGeneratedAt, setCacheGeneratedAt] = useState<string | null>(null);
  const [cacheValidUntil, setCacheValidUntil] = useState<string | null>(null);
  const [cacheCount, setCacheCount] = useState(0);
  const [arrivalsCache, setArrivalsCache] = useState<CachedArrival[]>([]);
  const [actionBusy, setActionBusy] = useState<"checkin" | "checkout" | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    const sync = () => setNetworkOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    try {
      const sound = window.localStorage.getItem("checkin_sound_enabled");
      const vibrate = window.localStorage.getItem("checkin_vibrate_enabled");
      const autoPack = window.localStorage.getItem("checkin_auto_pack_refresh");
      if (sound != null) setEnableSuccessSound(sound === "1");
      if (vibrate != null) setEnableVibrate(vibrate === "1");
      if (autoPack != null) setAutoRefreshPack(autoPack !== "0");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("checkin_auto_pack_refresh", autoRefreshPack ? "1" : "0");
    } catch {}
  }, [autoRefreshPack]);

  useEffect(() => {
    if (!token) return;
    void loadEncryptedQueue(token).then((items) => setQueue(normalizeOfflineQueue(items)));
  }, [token]);

  useEffect(() => {
    void loadTodayArrivalsCache().then((cached) => {
      if (!cached) return;
      setArrivalsCache(cached.items || []);
      setCacheGeneratedAt(cached.generated_at || null);
      setCacheValidUntil(cached.valid_until || null);
      setCacheCount(Number(cached.count ?? (cached.items?.length || 0)));
      setCacheUpdatedAt(cached.updated_at || null);
    });
  }, []);

  useEffect(() => {
    const cached = loadCachedQrPublicKey();
    if (cached) setQrPublicKey(cached);
  }, []);

  useEffect(() => {
    if (!token || !networkOnline) return;
    void apiFetch<QrPublicKeyResponse>(
      "/v2/qr/public-key",
      { method: "GET" },
      token,
      qrPublicKeyResponseSchema,
    )
      .then((row) => {
        if (!row?.public_key) return;
        setQrPublicKey(row.public_key);
        cacheQrPublicKey(row.public_key);
      })
      .catch(() => {
        // Keep cached key for offline verification.
      });
  }, [networkOnline, token]);

  const persistQueue = useCallback(async (items: QueuedAction[]) => {
    if (!token) return;
    await saveEncryptedQueue(items, token);
  }, [token]);

  const preloadTodayArrivals = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (preloadBusyRef.current) return;
    if (!token || !networkOnline) {
      if (!silent) {
        showToast({ type: "warning", title: "Refresh unavailable", message: "Go online to refresh offline pack." });
      }
      return;
    }
    preloadBusyRef.current = true;
    setPreloadBusy(true);
    try {
      const data = await apiFetch<ReservationListResponse>(
        "/v2/reservations?limit=300&offset=0&sort_by=check_in_date&sort_dir=asc",
        { method: "GET" },
        token,
        reservationListResponseSchema,
      );
      const today = todayDateKey();
      const tomorrow = plusDaysDateKey(1);
      const candidates = (data.items || []).filter(
        (item) => item.check_in_date === today || item.check_in_date === tomorrow,
      );
      const items: CachedArrival[] = [];
      for (const item of candidates) {
        let signedToken: CachedArrival["signed_token"] = null;
        try {
          const tokenPayload = await apiFetch<QrToken>(
            "/v2/qr/issue",
            {
              method: "POST",
              body: JSON.stringify({ reservation_id: item.reservation_id }),
            },
            token,
            qrTokenSchema,
          );
          signedToken = {
            jti: tokenPayload.jti,
            expires_at: tokenPayload.expires_at,
            rotation_version: tokenPayload.rotation_version,
            signature: tokenPayload.signature,
          };
        } catch {
          signedToken = null;
        }
        const cachedEntry: CachedArrival = {
          reservation_id: item.reservation_id,
          reservation_code: item.reservation_code,
          check_in_date: item.check_in_date,
          check_out_date: item.check_out_date,
          status: item.status,
          guest_name: item.guest?.name || null,
          total_amount: item.total_amount ?? 0,
          amount_paid_verified: item.amount_paid_verified ?? 0,
          balance_due: item.balance_due ?? 0,
          signed_token: signedToken,
          signed_hash: null,
          cached_at: new Date().toISOString(),
          signature_hint: signedToken ? "server-qr-token" : "missing-signature",
        };
        const signed_hash = await buildCachedArrivalSignatureHash(cachedEntry);
        items.push({ ...cachedEntry, signed_hash });
      }
      await saveTodayArrivalsCache(items, today);
      setArrivalsCache(items);
      const generatedAt = new Date().toISOString();
      const validUntilDate = new Date();
      validUntilDate.setHours(23, 59, 59, 999);
      validUntilDate.setDate(validUntilDate.getDate() + 1);
      setCacheUpdatedAt(generatedAt);
      setCacheGeneratedAt(generatedAt);
      setCacheValidUntil(validUntilDate.toISOString());
      setCacheCount(items.length);
      const signedCount = items.filter((entry) => Boolean(entry.signed_token?.signature)).length;
      if (!silent) {
        showToast({
          type: "success",
          title: "Offline pack refreshed",
          message: `${items.length} arrival(s) cached (today + tomorrow), ${signedCount} signed.`,
        });
      }
    } catch (e) {
      if (!silent) {
        showToast({ type: "error", title: "Pack refresh failed", message: getApiErrorMessage(e, "Unable to refresh arrivals.") });
      }
    } finally {
      preloadBusyRef.current = false;
      setPreloadBusy(false);
    }
  }, [networkOnline, showToast, token]);

  useEffect(() => {
    if (!autoRefreshPack || !token || !networkOnline) return;
    const interval = window.setInterval(() => {
      void preloadTodayArrivals({ silent: true });
    }, 30 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [autoRefreshPack, networkOnline, preloadTodayArrivals, token]);

  const stopCamera = useCallback(async () => {
    const scanner = qrScannerRef.current;
    qrScannerRef.current = null;
    scanHandledRef.current = false;
    setScanActive(false);
    setScanHintsVisible(false);
    setTorchOn(false);
    setTorchSupported(false);
    videoTrackRef.current = null;
    if (!scanner) return;
    try { if (scanner.isScanning) await scanner.stop(); } catch {}
    try { scanner.clear(); } catch {}
  }, []);

  const triggerScanPulse = useCallback(() => {
    setScanPulse(true);
    if (scanPulseTimeoutRef.current) {
      window.clearTimeout(scanPulseTimeoutRef.current);
    }
    scanPulseTimeoutRef.current = window.setTimeout(() => {
      setScanPulse(false);
      scanPulseTimeoutRef.current = null;
    }, 520);
  }, []);

  const markResult = useCallback((data: QrVerifyResponse, options?: { silentToast?: boolean }) => {
    setResult(data);
    setValidatedAt(new Date().toISOString());
    const invalid = friendlyInvalidReason(data.reason);
    setOutcome(data.allowed ? "valid" : "invalid");
    if (!options?.silentToast) {
      if (data.allowed) {
        showToast({ type: "success", title: "Validation passed", message: "Ready to confirm check-in." });
      } else {
        showToast({ type: "error", title: "Validation failed", message: invalid });
      }
    }
    if (data.allowed) {
      tryPlaySuccessTone(enableSuccessSound);
      if (enableVibrate && "vibrate" in navigator) navigator.vibrate?.(30);
    } else {
      setShowTokenFallback(true);
    }
  }, [enableSuccessSound, enableVibrate, showToast]);

  const localValidateFromCacheByCode = useCallback(async (code: string): Promise<QrVerifyResponse | null> => {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return null;
    const cached = arrivalsCache.find((item) => item.reservation_code.toLowerCase() === normalized);
    if (!cached) return null;
    const evaluation = evaluateOfflineArrival(cached);
    const local: QrVerifyResponse = {
      reservation_id: cached.reservation_id,
      reservation_code: cached.reservation_code,
      guest_name: cached.guest_name || null,
      status: cached.status || "confirmed",
      allowed: evaluation.allowed,
      can_override: evaluation.canOverride ?? false,
      reason: evaluation.reason || null,
      scanner_id: scannerId,
      offline_mode: true,
    };
    setResult(local);
    setDetail(buildDetailFromCache(cached));
    setTokenExpiry(null);
    setActiveTokenJti(null);
    setTokenVerdict("unknown");
    setTokenVerdictReason(null);
    setValidatedAt(new Date().toISOString());
    setOutcome(local.allowed ? "valid" : "invalid");
    return local;
  }, [arrivalsCache, scannerId]);

  const localValidateFromCacheByToken = useCallback(async (parsed: QrToken): Promise<QrVerifyResponse | null> => {
    const cached = arrivalsCache.find((item) => {
      const idMatch = item.reservation_id === parsed.reservation_id;
      const codeMatch =
        !parsed.reservation_code ||
        item.reservation_code.toLowerCase() === parsed.reservation_code.toLowerCase();
      return idMatch && codeMatch;
    });
    if (!cached) return null;
    const evaluation = evaluateOfflineArrival(cached);
    const local: QrVerifyResponse = {
      reservation_id: cached.reservation_id,
      reservation_code: cached.reservation_code,
      guest_name: cached.guest_name || null,
      status: cached.status || "confirmed",
      allowed: evaluation.allowed,
      can_override: evaluation.canOverride ?? false,
      reason: evaluation.reason || null,
      scanner_id: scannerId,
      offline_mode: true,
    };
    setResult(local);
    setDetail(buildDetailFromCache(cached));
    setValidatedAt(new Date().toISOString());
    setOutcome(local.allowed ? "valid" : "invalid");
    return local;
  }, [arrivalsCache, scannerId]);

  const validateCode = useCallback(async (code: string) => {
    if (!token) return;
    const normalized = code.trim();
    if (!normalized) return;
    setTokenVerdict("unknown");
    setTokenVerdictReason(null);
    setActiveTokenJti(null);
    setTokenExpiry(null);
    const cacheIsExpired = Boolean(cacheValidUntil) && Date.parse(cacheValidUntil || "") < Date.now();
    if (!networkOnline) {
      if (cacheIsExpired) {
        setOutcome("invalid");
        showToast({ type: "warning", title: "Offline pack expired", message: "Reconnect and preload arrivals again." });
        return;
      }
      const local = await localValidateFromCacheByCode(normalized);
      if (local) {
        showToast({
          type: local.allowed ? "success" : "warning",
          title: local.allowed ? "Validated from cache" : "Blocked from cache",
          message: local.allowed ? "You can queue check-in action while offline." : friendlyInvalidReason(local.reason),
        });
        return;
      }
      setOutcome("invalid");
      showToast({ type: "warning", title: "Internet required", message: "Code validation needs internet unless preloaded." });
      return;
    }
    try {
      const data = await apiFetch<QrVerifyResponse>("/v2/qr/verify", { method: "POST", body: JSON.stringify({ reservation_code: normalized, scanner_id: scannerId, offline_mode: false }) }, token, qrVerifyResponseSchema);
      markResult(data);
    } catch (e) {
      const local = await localValidateFromCacheByCode(normalized);
      if (isLikelyNetworkError(e) && local) {
        showToast({ type: "warning", title: "Validated from cache", message: "Network lost. Using preloaded arrivals." });
        return;
      }
      throw e;
    }
  }, [cacheValidUntil, localValidateFromCacheByCode, markResult, networkOnline, scannerId, showToast, token]);

  const validateToken = useCallback(async (parsed: QrToken, raw?: Record<string, unknown>) => {
    if (!token) return;
    setTokenExpiry(parsed.expires_at || null);
    setActiveTokenJti(parsed.jti || null);
    setValidatedAt(new Date().toISOString());
    const localTokenCheck = await verifyQrTokenLocally(parsed, qrPublicKey, {
      reservationCodeHint: parsed.reservation_code || null,
      verifyReplay: true,
    });
    setTokenVerdict(localTokenCheck.verdict);
    setTokenVerdictReason(localTokenCheck.reason);
    if (localTokenCheck.verdict !== "valid" && !networkOnline) {
      setOutcome("invalid");
      showToast({ type: "error", title: "Token invalid", message: localTokenCheck.reason || "QR token validation failed." });
      return;
    }

    const cacheIsExpired = Boolean(cacheValidUntil) && Date.parse(cacheValidUntil || "") < Date.now();
    if (!networkOnline) {
      if (cacheIsExpired) {
        setOutcome("invalid");
        showToast({ type: "warning", title: "Offline pack expired", message: "Reconnect and preload arrivals again." });
        return;
      }
      const local = await localValidateFromCacheByToken(parsed);
      if (local) {
        showToast({
          type: local.allowed ? "success" : "warning",
          title: local.allowed ? "Validated from cache" : "Blocked from cache",
          message: local.allowed ? "You can queue check-in action while offline." : friendlyInvalidReason(local.reason),
        });
      } else {
        setOutcome("invalid");
        showToast({ type: "warning", title: "Validation blocked", message: "No preload match found for this token." });
      }
      return;
    }
    try {
      const data = await apiFetch<QrVerifyResponse>("/v2/qr/verify", { method: "POST", body: JSON.stringify({ qr_token: parsed, scanner_id: scannerId, offline_mode: false }) }, token, qrVerifyResponseSchema);
      markResult(data);
    } catch (e) {
      const local = await localValidateFromCacheByToken(parsed);
      if (isLikelyNetworkError(e) && local) {
        showToast({ type: "warning", title: "Validated from cache", message: "Network lost. Using preloaded arrivals." });
        return;
      }
      setOutcome("invalid");
      const message = friendlyInvalidReason(null, getApiErrorMessage(e, "Validation failed."));
      showToast({ type: "error", title: "Validation failed", message });
    }
    void raw;
  }, [cacheValidUntil, localValidateFromCacheByToken, markResult, networkOnline, qrPublicKey, scannerId, showToast, token]);

  const startCamera = useCallback(async (requestedCameraId?: string) => {
    setScanLoading(true);
    setOutcome("scanning");
    setCameraPermissionError(null);
    await stopCamera();
    try {
      const scanner = new Html5Qrcode(CAMERA_READER_ID);
      qrScannerRef.current = scanner;
      const cameraList = await Html5Qrcode.getCameras();
      if (!cameraList.length) throw new Error("No camera detected.");
      setCameras(cameraList);
      const cameraId = requestedCameraId || activeCameraId || pickPreferredCameraId(cameraList);
      setActiveCameraId(cameraId);
      const scanRoot = document.getElementById(CAMERA_READER_ID);
      const rootWidth = scanRoot?.clientWidth ?? 320;
      const mobileViewport = window.matchMedia("(max-width: 768px)").matches;
      const dynamicBox = Math.round(
        Math.min(
          mobileViewport ? 300 : 320,
          Math.max(mobileViewport ? 180 : 200, rootWidth * (mobileViewport ? 0.68 : 0.58)),
        ),
      );
      await scanner.start(
        cameraId,
        {
          fps: mobileViewport ? 12 : 14,
          qrbox: { width: dynamicBox, height: dynamicBox },
          aspectRatio: mobileViewport ? 1.333 : 1.777,
        },
        (decoded) => {
        if (scanHandledRef.current) return;
        scanHandledRef.current = true;
        triggerScanPulse();
        void (async () => {
          try {
            try {
              const raw = JSON.parse(decoded);
              const parsed = qrTokenSchema.parse(raw);
              await validateToken(parsed, raw);
            } catch {
              setReservationCode(decoded);
              await validateCode(decoded);
            }
          } catch (error) {
            setOutcome("invalid");
            showToast({
              type: "error",
              title: "Validation failed",
              message: getApiErrorMessage(error, "Unable to validate scanned QR."),
            });
          } finally {
            await stopCamera();
          }
        })();
      }, () => {});
        setScanActive(true);
        const videoEl = document.querySelector(`#${CAMERA_READER_ID} video`) as HTMLVideoElement | null;
      const mediaTrack = videoEl?.srcObject instanceof MediaStream ? videoEl.srcObject.getVideoTracks()[0] ?? null : null;
      videoTrackRef.current = mediaTrack;
      const caps = mediaTrack?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(Boolean(caps?.torch));
      } catch (e) {
      const rawMessage = String(e ?? "Failed to start camera.");
      const chunkError = /failed to load chunk|loading chunk|chunkloaderror/i.test(rawMessage);
      const message = chunkError
        ? "Camera module is not cached yet. Go online once and open Scan to warm the scanner."
        : rawMessage;
      if (/permission|denied|notallowed/i.test(rawMessage)) {
        setCameraPermissionError("Allow camera access in browser settings, then retry.");
      }
        setOutcome("invalid");
        showToast({ type: "error", title: "Camera unavailable", message });
      } finally {
        setScanLoading(false);
      }
    }, [activeCameraId, showToast, stopCamera, triggerScanPulse, validateCode, validateToken]);

  const toggleCamera = useCallback(async () => {
    if (scanActive) await stopCamera();
    else if (!scanLoading) await startCamera();
  }, [scanActive, scanLoading, startCamera, stopCamera]);

  const switchCamera = useCallback(async () => {
    if (cameras.length < 2 || !scanActive) return;
    const currentIndex = cameras.findIndex((camera) => camera.id === activeCameraId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cameras.length : 0;
    const next = cameras[nextIndex];
    if (!next) return;
    await startCamera(next.id);
  }, [activeCameraId, cameras, scanActive, startCamera]);

  const toggleTorch = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track || !torchSupported) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {}
  }, [torchOn, torchSupported]);

  const resetAll = useCallback(async () => {
    if (scanPulseTimeoutRef.current) {
      window.clearTimeout(scanPulseTimeoutRef.current);
      scanPulseTimeoutRef.current = null;
    }
    await stopCamera();
    setOutcome("ready");
    setScanPulse(false);
    setResult(null);
    setDetail(null);
    setReservationCode("");
    setTokenFallbackInput("");
    setShowTokenFallback(false);
    setTokenExpiry(null);
    setTokenVerdict("unknown");
    setTokenVerdictReason(null);
    setActiveTokenJti(null);
    setValidatedAt(null);
    setOverrideReason("");
  }, [stopCamera]);

  useEffect(() => {
    if (mode !== "scan" && scanActive) {
      void stopCamera();
    }
  }, [mode, scanActive, stopCamera]);

  useEffect(() => {
    if (!scanActive || outcome !== "scanning") {
      setScanHintsVisible(false);
      setScanHintIndex(0);
      return;
    }
    const initial = window.setTimeout(() => setScanHintsVisible(true), 3200);
    const rotate = window.setInterval(() => {
      setScanHintIndex((prev) => (prev + 1) % SCAN_HINTS.length);
    }, 3800);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(rotate);
    };
  }, [outcome, scanActive]);

  useEffect(() => {
    if (outcome === "invalid") {
      setShowTokenFallback(true);
    }
  }, [outcome]);

  useEffect(() => {
    if (!tokenExpiry) {
      setTokenSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(tokenExpiry) - Date.now()) / 1000));
      setTokenSecondsLeft(remaining);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [tokenExpiry]);

  useEffect(
    () => () => {
      if (scanPulseTimeoutRef.current) {
        window.clearTimeout(scanPulseTimeoutRef.current);
      }
    },
    [],
  );

  const validateManual = useCallback(async () => {
    if (!token) return;
    if (mode !== "code") return;
    setBusy(true);
    try {
      if (showTokenFallback && tokenFallbackInput.trim().length > 0) {
        const raw = JSON.parse(tokenFallbackInput);
        const parsed = qrTokenSchema.parse(raw);
        await validateToken(parsed, raw as Record<string, unknown>);
      } else {
        await validateCode(reservationCode.trim());
      }
    } catch (e) {
      setOutcome("invalid");
      const message = getApiErrorMessage(e, "Validation failed.");
      showToast({ type: "error", title: "Validation failed", message });
    } finally {
      setBusy(false);
    }
  }, [mode, reservationCode, showTokenFallback, showToast, token, tokenFallbackInput, validateCode, validateToken]);

  const syncQueue = useCallback(async () => {
    if (!token || !networkOnline) return;
    const pendingItems = queue.filter((item) => item.syncStatus === "pending" || item.syncStatus === "failed");
    if (pendingItems.length === 0) return;
    setSyncing(true);
    let nextQueue = [...queue];
    const reportEntries: SyncReportItem[] = [];
    let syncedCount = 0;
    let rejectedCount = 0;
    for (const item of pendingItems) {
      try {
        const operation = {
          operation_id: `checkin-queue-${item.id}`,
          idempotency_key: `checkin-queue-${item.id}`,
          entity_type: item.actionType,
          action: item.actionType === "checkin" ? "checkin.perform" : "checkout.perform",
          entity_id: item.reservationId,
          payload: {
            reservation_id: item.reservationId,
            scanner_id: scannerId,
            override_reason: item.actionType === "checkin" ? item.overrideReason : undefined,
          },
          created_at: item.queuedAt,
          retry_count: 0,
        };
        const push = await apiFetch<SyncPushResult>(
          "/v2/sync/push",
          {
            method: "POST",
            body: JSON.stringify({
              scope: "admin",
              operations: [operation],
            }),
          },
          token,
          syncPushResultSchema,
        );
        const pushResult = push.results[0];
        if (!pushResult) throw new Error("No sync result returned.");
        if (pushResult.status !== "applied" && pushResult.status !== "noop") {
          const message = pushResult.error_message || "Sync push failed.";
          const hint = pushResult.conflict?.resolution_hint || null;
          const httpStatus = Number(pushResult.http_status || 0) || null;
          nextQueue = nextQueue.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  syncStatus: "failed",
                  syncMessage: message,
                  syncHint: hint,
                  syncHttpStatus: httpStatus,
                }
              : entry,
          );
          reportEntries.push({
            id: crypto.randomUUID(),
            queuedId: item.id,
            label: pendingLabel(item),
            outcome: "failed",
            message: hint ? `${message} (${hint})` : message,
            at: new Date().toISOString(),
          });
          rejectedCount += 1;
          continue;
        }
        const payload = pushResult.response_payload || {};
        const data = checkOperationResponseSchema.safeParse(payload).success
          ? checkOperationResponseSchema.parse(payload)
          : null;
        nextQueue = nextQueue.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                syncStatus: "synced",
                syncHint: null,
                syncHttpStatus: 200,
                syncMessage:
                  item.actionType === "checkin" && data?.escrow_release_state === "pending_release"
                    ? "Checked in synced (on-chain release pending retry)"
                    : `${(data?.status || (item.actionType === "checkin" ? "checked_in" : "checked_out")).replace("_", " ")} synced`,
              }
            : entry,
        );
        reportEntries.push({
          id: crypto.randomUUID(),
          queuedId: item.id,
          label: item.reservationCode,
          outcome: "synced",
          message: `${item.actionType === "checkin" ? "Check-in" : "Check-out"} synced successfully.`,
          at: new Date().toISOString(),
        });
        if (item.actionType === "checkin" && result?.reservation_id === item.reservationId) {
          setResult((prev) => (prev ? { ...prev, status: "checked_in" } : prev));
          setOutcome("valid");
        }
        syncedCount += 1;
    } catch (e) {
      if (isLikelyNetworkError(e)) break;
      const message = getApiErrorMessage(e, "Sync failed.");
      nextQueue = nextQueue.map((entry) =>
        entry.id === item.id
          ? { ...entry, syncStatus: "failed", syncMessage: message, syncHint: null, syncHttpStatus: null }
            : entry,
        );
        reportEntries.push({
          id: crypto.randomUUID(),
          queuedId: item.id,
          label: pendingLabel(item),
          outcome: "failed",
          message,
          at: new Date().toISOString(),
        });
        rejectedCount += 1;
      }
    }
    setQueue(nextQueue);
    if (reportEntries.length > 0) {
      setSyncReport((prev) => [...reportEntries, ...prev].slice(0, 24));
    }
    void persistQueue(nextQueue);
    setSyncing(false);
    if (syncedCount > 0 || rejectedCount > 0) {
      const remainingCount = nextQueue.filter((item) => item.syncStatus === "pending" || item.syncStatus === "failed").length;
      if (rejectedCount > 0) {
        showToast({
          type: "warning",
          title: `Queue sync: ${syncedCount} synced, ${rejectedCount} failed`,
          message: `${remainingCount} pending action(s) remaining.`,
        });
      } else {
        showToast({
          type: "success",
          title: `Queue sync complete: ${syncedCount} synced`,
          message: `${remainingCount} pending action(s) remaining.`,
        });
      }
    }
  }, [networkOnline, persistQueue, queue, result?.reservation_id, scannerId, showToast, token]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    void clearEncryptedQueue();
  }, []);

  const enqueueAction = useCallback(
    async (actionType: "checkin" | "checkout", source: "scan" | "code", overrideReasonForQueue?: string | null) => {
      if (!result?.reservation_id || !result.reservation_code) return false;
      const alreadyQueued = queue.some(
        (entry) =>
          entry.reservationId === result.reservation_id &&
          entry.actionType === actionType &&
          entry.syncStatus === "pending",
      );
      if (alreadyQueued) {
        showToast({
          type: "info",
          title: "Already queued",
          message: `${result.reservation_code} already has a pending ${actionType}.`,
        });
        return false;
      }
      const localValidation: LocalValidation = outcome === "valid" ? "valid" : outcome === "invalid" ? "invalid" : "unknown";
      const next: QueuedAction[] = [
        ...queue,
        {
          id: crypto.randomUUID(),
          actionType,
          reservationId: result.reservation_id,
          reservationCode: result.reservation_code,
          overrideReason: actionType === "checkin" ? (overrideReasonForQueue?.trim() || null) : null,
          tokenJti: activeTokenJti,
          validatedAt: validatedAt || new Date().toISOString(),
          queuedAt: new Date().toISOString(),
          source,
          localValidation,
          localVerdict: (Boolean(result.allowed || result.can_override) ? "allowed" : "blocked"),
          syncStatus: "pending",
          syncMessage: null,
          syncHint: null,
          syncHttpStatus: null,
        },
      ];
      setQueueWriteBusy(true);
      try {
        setQueue(next);
        await persistQueue(next);
        if (actionType === "checkin" && activeTokenJti) {
          await markQrJtiUsed(activeTokenJti, result.reservation_code, "queued");
        }
      } finally {
        setQueueWriteBusy(false);
      }
      setMode("queue");
      setOutcome("queued");
      const queuedReport: SyncReportItem = {
        id: crypto.randomUUID(),
        label: result.reservation_code,
        outcome: "queued",
        message: `${actionType === "checkin" ? "Check-in" : "Check-out"} queued for sync.`,
        at: new Date().toISOString(),
      };
      setSyncReport((prev) => [queuedReport, ...prev].slice(0, 24));
      showToast({
        type: "warning",
        title: `Queued ${actionType === "checkin" ? "check-in" : "check-out"} for ${result.reservation_code}`,
        message: "Open Queue tab and tap Sync now once online.",
      });
      return true;
    },
    [activeTokenJti, outcome, persistQueue, queue, result, showToast, validatedAt],
  );

  const loadSyncResult = useCallback((entry: SyncReportItem) => {
    if (!entry.verifyResult) return;
    setResult(entry.verifyResult);
    setTokenVerdict("unknown");
    setTokenVerdictReason(null);
    setActiveTokenJti(null);
    setValidatedAt(new Date().toISOString());
    setReservationCode(entry.verifyResult.reservation_code || entry.label);
    setTokenFallbackInput("");
    setShowTokenFallback(false);
    setOverrideReason("");
    showToast({ type: "info", title: "Loaded from sync results", message: "Review details and confirm check-in if allowed." });
  }, [showToast]);

  const canOverride = Boolean(result?.can_override);
  const unpaidBalance = Number(detail?.balance_due ?? 0);
  const hasCache = arrivalsCache.length > 0;
  const cacheExpired = Boolean(cacheValidUntil) && Date.parse(cacheValidUntil || "") < Date.now();
  const pendingQueueCount = queue.filter((item) => item.syncStatus === "pending" || item.syncStatus === "failed").length;
  const hasOutstandingBalance = Number.isFinite(unpaidBalance) && unpaidBalance > 0;
  const pendingQueuedCheckin = Boolean(result?.reservation_id) && queue.some(
    (entry) =>
      entry.reservationId === result?.reservation_id &&
      entry.actionType === "checkin" &&
      entry.syncStatus === "pending",
  );
  const syncedQueuedCheckin = Boolean(result?.reservation_id) && queue.some(
    (entry) =>
      entry.reservationId === result?.reservation_id &&
      entry.actionType === "checkin" &&
      entry.syncStatus === "synced",
  );
  const canCheckin = Boolean(result && (result.allowed || canOverride));
  const canCheckout = String(result?.status || "").toLowerCase() === "checked_in";
  const showOverrideFlow = hasOutstandingBalance && canOverride;
  const canDirectCheckin = canCheckin && !hasOutstandingBalance && !pendingQueuedCheckin && !queueWriteBusy;
  const canDirectCheckout = canCheckout && !hasOutstandingBalance && !queueWriteBusy;
  const canSwitchCamera = cameras.length > 1;
  const expiredByReason = String(result?.reason || "").toLowerCase().includes("expired");
  const invalidDetail = friendlyInvalidReason(result?.reason);
  const primaryActionKind: "checkin" | "override" | "checkout" = canCheckout
    ? "checkout"
    : showOverrideFlow
      ? "override"
      : "checkin";
  const resultStatusLabel = pendingQueuedCheckin
    ? "check-in queued"
    : syncedQueuedCheckin
      ? "synced"
      : String(result?.status || "-").replaceAll("_", " ");

  const flowStatus = (() => {
    if (pendingQueuedCheckin || outcome === "queued") {
      return {
        label: "Check-in queued",
        detail: "Action saved offline. Open Queue tab and sync when online.",
        tone: "warn" as const,
      };
    }
    if (syncedQueuedCheckin) {
      return {
        label: "Synced",
        detail: "Queued action synced successfully.",
        tone: "success" as const,
      };
    }
    if (String(result?.status || "").toLowerCase() === "checked_in") {
      return {
        label: "Checked in",
        detail: "Guest is already checked in.",
        tone: "success" as const,
      };
    }
    if (outcome === "invalid" || !result?.allowed) {
      return {
        label: "Blocked",
        detail: tokenVerdictReason || invalidDetail,
        tone: "error" as const,
      };
    }
    if (hasOutstandingBalance) {
      return {
        label: "Payment needed",
        detail: `Remaining balance: ${formatPeso(unpaidBalance)}.`,
        tone: "warn" as const,
      };
    }
    if (result?.allowed) {
      return {
        label: networkOnline ? "Ready for check-in" : "Ready (queue mode)",
        detail: networkOnline ? "Confirm check-in now." : "Confirm check-in to queue action.",
        tone: "success" as const,
      };
    }
    return {
      label: "Awaiting validation",
      detail: "Validate scan or code to continue.",
      tone: "neutral" as const,
    };
  })();

  useEffect(() => {
    if (!token || !result?.reservation_id || !networkOnline) return;
    setDetailLoading(true);
    void apiFetch<ReservationItem>(`/v2/reservations/${encodeURIComponent(result.reservation_id)}`, { method: "GET" }, token, reservationListItemSchema)
      .then((row) => setDetail(row))
      .catch(() => {
        // Keep cached/local detail when online refetch fails.
      })
      .finally(() => setDetailLoading(false));
  }, [networkOnline, result?.reservation_id, token]);

  const performCheckin = useCallback(async () => {
    if (!token || !result) return;
    if (!networkOnline) {
      await enqueueAction(
        "checkin",
        mode === "scan" ? "scan" : "code",
        showOverrideFlow ? overrideReason.trim() : null,
      );
      return;
    }
    if (String(result.status || "").toLowerCase() === "checked_in") {
      showToast({ type: "info", title: "Already checked in", message: "Use Check-out when guest departs." });
      return;
    }
    if (!result.allowed && result.can_override && overrideReason.trim().length < 5) {
      showToast({ type: "warning", title: "Override reason required", message: "Please enter at least 5 characters." });
      return;
    }
    setActionBusy("checkin");
    await apiFetch<CheckOperationResponse>(
      "/v2/checkins",
      {
        method: "POST",
        body: JSON.stringify({
          reservation_id: result.reservation_id,
          scanner_id: scannerId,
          override_reason: showOverrideFlow ? overrideReason.trim() : null,
        }),
      },
      token,
      checkOperationResponseSchema,
    )
      .then(async (data) => {
        if (activeTokenJti) {
          await markQrJtiUsed(activeTokenJti, result.reservation_code, "confirmed");
        }
        setResult((prev) => (prev ? { ...prev, status: "checked_in" } : prev));
        const welcome = data.welcome_notification;
        let successMessage: string | undefined;
        if (welcome?.created) {
          successMessage = welcome.fallback_used
            ? "Welcome sent using fallback suggestions."
            : "Welcome suggestions sent to My Stay.";
        } else if (welcome?.notification_id) {
          successMessage = "Welcome suggestions are already available in My Stay.";
        }
        showToast({ type: "success", title: "Check-in successful", message: successMessage });
        if (data.escrow_release_state === "pending_release") {
          showToast({
            type: "warning",
            title: "On-chain release pending",
            message: "Retry will run automatically. You can also retry from Blockchain or Escrow page.",
          });
        }
      })
      .catch(async (e) => {
        if (isLikelyNetworkError(e)) {
          const queued = await enqueueAction(
            "checkin",
            mode === "scan" ? "scan" : "code",
            showOverrideFlow ? overrideReason.trim() : null,
          );
          if (queued) return;
        }
        showToast({ type: "error", title: "Check-in failed", message: friendlyCheckinFailure(e, result.status) });
      })
      .finally(() => setActionBusy(null));
  }, [activeTokenJti, enqueueAction, mode, networkOnline, overrideReason, result, scannerId, showOverrideFlow, showToast, token]);

  const performCheckout = useCallback(async () => {
    if (!token || !result) return;
    if (!networkOnline) {
      await enqueueAction("checkout", mode === "scan" ? "scan" : "code");
      return;
    }
    setActionBusy("checkout");
    await apiFetch<CheckOperationResponse>("/v2/checkouts", { method: "POST", body: JSON.stringify({ reservation_id: result.reservation_id, scanner_id: scannerId }) }, token, checkOperationResponseSchema)
      .then(() => {
        showToast({ type: "success", title: "Check-out successful" });
      })
      .catch(async (e) => {
      if (isLikelyNetworkError(e)) {
        const queued = await enqueueAction("checkout", mode === "scan" ? "scan" : "code");
        if (queued) return;
      }
      showToast({ type: "error", title: "Check-out failed", message: getApiErrorMessage(e, "Request failed.") });
    })
      .finally(() => setActionBusy(null));
  }, [enqueueAction, mode, networkOnline, result, scannerId, showToast, token]);

  useEffect(() => {
    if (!result) return;
    const timeout = window.setTimeout(() => {
      if (resultCardRef.current) smoothScrollToElement(resultCardRef.current);
      primaryActionRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timeout);
  }, [primaryActionKind, result]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        void resetAll();
      }
      if (event.key === "Enter" && !actionBusy) {
        if (canDirectCheckout) {
          event.preventDefault();
          void performCheckout();
          return;
        }
        if (canDirectCheckin) {
          event.preventDefault();
          void performCheckin();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actionBusy, canDirectCheckin, canDirectCheckout, performCheckin, performCheckout, resetAll]);

  if (!token) {
    return (
      <section className="surface p-4 sm:p-5">
        <p className="text-sm font-semibold text-[var(--color-text)]">No active session found.</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">Sign in as admin first.</p>
      </section>
    );
  }

  return (
    <section className={`mx-auto w-full ${tabletView ? "max-w-7xl" : "max-w-6xl"} space-y-3 sm:space-y-4`}>
      {!networkOnline ? (
        <ResultBanner
          tone="offline"
          message="OFFLINE MODE - validating QR locally; actions will sync later."
          detail="Scan is primary. Code fallback requires a fresh offline pack."
          className="sticky top-2 z-20 shadow-[var(--shadow-sm)]"
        />
      ) : null}
      <header className="surface p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)] sm:text-3xl">Check-in Console</h1>
            <p className="mt-1 text-xs text-[var(--color-muted)] sm:text-sm">Kiosk-friendly scan flow with offline queue.</p>
            <div className="mt-2">
              <DataFreshnessBadge />
            </div>
          </div>
          <ScanHeader
            onOpenSettings={() => setSettingsDrawerOpen(true)}
          />
        </div>
      </header>

      <div className={`grid gap-3 sm:gap-4 ${tabletView ? "xl:grid-cols-[1.35fr_0.65fr]" : "xl:grid-cols-[1.15fr_0.85fr]"} xl:items-start`}>
        <section className="surface p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--color-text)] sm:text-base">Manual fallback + system status</p>
            <StatusPill
              label={networkOnline ? "Online" : "Offline"}
              tone={networkOnline ? "success" : "warn"}
              icon={networkOnline ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
            />
          </div>
          <ScanSegmentedControl value={mode} onChange={(value) => setMode(value as Mode)} queueCount={pendingQueueCount} />
          <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">Offline check-in data</p>
              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap sm:overflow-visible">
                <p className="shrink-0 text-xs text-[var(--color-muted)]">
                  Last refresh: <span className="font-semibold text-[var(--color-text)]">{formatTimeInline(cacheUpdatedAt)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => void preloadTodayArrivals()}
                  disabled={preloadBusy || !networkOnline}
                  className="inline-flex h-8 w-[184px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-[11px] font-semibold text-[var(--color-text)] disabled:opacity-50"
                >
                  {preloadBusy ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  Refresh offline pack now
                </button>
              </div>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <input
                type="checkbox"
                checked={autoRefreshPack}
                onChange={(event) => setAutoRefreshPack(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)]"
              />
              Auto-refresh offline pack every 30 minutes (online)
            </label>
            <div className="mt-2 grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-1">
              <p>Count: <span className="font-semibold text-[var(--color-text)]">{cacheCount || arrivalsCache.length}</span></p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5 text-xs text-[var(--color-muted)] md:flex-row md:items-center md:gap-3 md:whitespace-nowrap">
              <StatusPill
                label={
                  !hasCache
                    ? "Pack missing"
                    : cacheExpired
                      ? "Pack expired"
                      : "Pack ready"
                }
                tone={!hasCache ? "warn" : cacheExpired ? "error" : "success"}
              />
              <p>
                Generated: <span className="font-semibold text-[var(--color-text)]">{formatDateTimeInline(cacheGeneratedAt)}</span>
              </p>
              <p>
                Valid until: <span className="font-semibold text-[var(--color-text)]">{formatDateTimeInline(cacheValidUntil)}</span>
              </p>
            </div>
            {!networkOnline && !hasCache ? (
              <p className="mt-2 text-xs font-medium text-amber-700">
                You are offline and no check-in pack is cached yet. Reconnect once and refresh the pack.
              </p>
            ) : null}
            {!networkOnline && hasCache && cacheExpired ? (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Cached check-in pack is expired. Reconnect and refresh for reliable code validation.
              </p>
            ) : null}
          </div>
          <div className="mt-3 space-y-3">
            {mode === "scan" ? (
              <div className="space-y-2">
                <CameraScanPanel
                  cameraReaderId={CAMERA_READER_ID}
                  statusLabel={scanActive || scanLoading ? "SCANNING" : "READY"}
                  statusTone={scanActive || scanLoading ? "info" : "neutral"}
                  scanActive={scanActive}
                  scanLoading={scanLoading}
                  permissionError={cameraPermissionError}
                  onToggleCamera={() => void toggleCamera()}
                  onReset={() => void resetAll()}
                  onRetryPermission={() => void startCamera()}
                  canSwitchCamera={canSwitchCamera}
                  onSwitchCamera={() => void switchCamera()}
                  torchSupported={torchSupported}
                  torchOn={torchOn}
                  onToggleTorch={() => void toggleTorch()}
                  showCameraOptions={canSwitchCamera || torchSupported}
                  scanPulse={scanPulse}
                  showHints={scanHintsVisible}
                  hint={SCAN_HINTS[scanHintIndex] || SCAN_HINTS[0]}
                  cameraHeightClassName={tabletView ? "h-[320px] sm:h-[440px] md:h-[520px]" : undefined}
                />
                <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-xs text-[var(--color-muted)]">
                  QR token rotates by server policy. Rescan if expired.
                  {tokenSecondsLeft != null ? (
                    <span className="ml-2 font-semibold text-[var(--color-text)]">Expires in {tokenSecondsLeft}s</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {mode === "code" ? (
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                  Reservation code
                </label>
                <input
                  value={reservationCode}
                  onChange={(e) => setReservationCode(e.target.value)}
                  placeholder="HR-20260302-XXXX"
                  className="h-11 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
                />
                {(showTokenFallback || outcome === "invalid") ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Paste token instead</p>
                    <textarea
                      value={tokenFallbackInput}
                      onChange={(e) => setTokenFallbackInput(e.target.value)}
                      placeholder='{"jti":"...","expires_at":"..."}'
                      className="min-h-[100px] w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTokenFallback(true)}
                    className="inline-flex h-9 items-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-muted)]"
                  >
                    Paste token instead
                  </button>
                )}
                {!networkOnline ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-900">Code validation needs internet unless preloaded.</p>
                    <p className="mt-1 text-xs text-amber-800">
                      {hasCache
                        ? `Offline preload ready (${arrivalsCache.length} arrival${arrivalsCache.length === 1 ? "" : "s"}).`
                        : "No preload cache found for offline code validation."}
                    </p>
                    {hasCache && cacheExpired ? (
                      <p className="mt-1 text-xs font-semibold text-amber-900">
                        Current pack expired. Reconnect and preload before validating by code.
                      </p>
                    ) : null}
                    {!hasCache ? (
                      <p className="mt-1 text-xs text-amber-800">
                        Reconnect, then use <span className="font-semibold">Refresh offline pack now</span>.
                      </p>
                    ) : null}
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setMode("scan")}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"
                      >
                        Switch to Scan
                      </button>
                      <button
                        type="button"
                        onClick={() => void validateManual()}
                        disabled={!hasCache || cacheExpired || (reservationCode.trim().length === 0 && tokenFallbackInput.trim().length === 0)}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
                      >
                        Validate from cache
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void validateManual()}
                    disabled={busy || (reservationCode.trim().length === 0 && tokenFallbackInput.trim().length === 0)}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {busy ? "Validating..." : "Validate"}
                  </button>
                )}
              </div>
            ) : null}

            {mode === "queue" ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--color-text)]">Offline Queue</p>
                  <StatusPill label={networkOnline ? "Online" : "Offline"} tone={networkOnline ? "success" : "warn"} />
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Offline actions are queued and will sync when online.</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Cached arrivals: {arrivalsCache.length} {cacheUpdatedAt ? `- updated ${new Date(cacheUpdatedAt).toLocaleTimeString()}` : ""}
                </p>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)]">
                  <CloudOff className="h-4 w-4 text-[var(--color-muted)]" />
                  <span>{pendingQueueCount} pending action(s)</span>
                </div>
                {queue.length > 0 ? (
                  <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white p-2">
                    {queue.slice(0, 8).map((item) => (
                      <article key={item.id} className="rounded-md border border-[var(--color-border)] bg-slate-50 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-[var(--color-text)]">{item.reservationCode}</p>
                          <StatusPill
                            label={item.syncStatus}
                            tone={item.syncStatus === "synced" ? "success" : item.syncStatus === "failed" ? "error" : "warn"}
                            className="px-2 py-0.5 text-[10px]"
                          />
                        </div>
                        <p className="text-[11px] text-[var(--color-muted)]">
                          {item.actionType.toUpperCase()} | {item.localVerdict} | {new Date(item.queuedAt).toLocaleTimeString()}
                        </p>
                        {item.tokenJti ? <p className="text-[11px] text-[var(--color-muted)]">token_jti: {item.tokenJti.slice(0, 8)}...</p> : null}
                        {item.syncMessage ? <p className="text-[11px] text-[var(--color-muted)]">{item.syncMessage}</p> : null}
                        {item.syncHint ? <p className="text-[11px] text-amber-700">Hint: {item.syncHint}</p> : null}
                        {item.syncHttpStatus ? <p className="text-[11px] text-[var(--color-muted)]">HTTP {item.syncHttpStatus}</p> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-[var(--color-border)] bg-white px-3 py-2 text-xs text-[var(--color-muted)]">
                    No queued actions yet.
                  </p>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void syncQueue()}
                    disabled={!networkOnline || pendingQueueCount === 0 || syncing}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <RefreshCcw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "Syncing..." : "Sync now"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (queue.length === 0) return;
                      if (!window.confirm("Clear queued actions? This cannot be undone.")) return;
                      clearQueue();
                    }}
                    disabled={queue.length === 0 || syncing}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear queue
                  </button>
                </div>
                {syncReport.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-white p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">Last Sync Results</p>
                      <button
                        type="button"
                        onClick={() => setSyncReport([])}
                        className="text-[11px] font-semibold text-[var(--color-muted)] underline underline-offset-2"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {syncReport.slice(0, 12).map((entry) => (
                        <article key={entry.id} className="rounded-md border border-[var(--color-border)] bg-slate-50 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-[var(--color-text)]">{entry.label}</p>
                            <div className="flex items-center gap-1.5">
                              {entry.verifyResult ? (
                                <button
                                  type="button"
                                  onClick={() => loadSyncResult(entry)}
                                  className="rounded-md border border-[var(--color-border)] bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text)]"
                                >
                                  Load
                                </button>
                              ) : null}
                              <StatusPill
                                label={entry.outcome}
                                tone={
                                  entry.outcome === "validated" || entry.outcome === "synced"
                                    ? "success"
                                    : entry.outcome === "blocked" || entry.outcome === "queued"
                                      ? "warn"
                                      : "error"
                                }
                                className="px-2 py-0.5 text-[10px]"
                              />
                            </div>
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--color-muted)]">{entry.message}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-3 sm:space-y-4">
          {tokenExpiry && !tabletView ? (
            <section className="surface p-3 text-xs text-[var(--color-text)]">
              <p className="font-semibold">Token</p>
              <p className="mt-1">
                {tokenSecondsLeft != null
                  ? `Expires in ${tokenSecondsLeft}s`
                  : `Expires ${new Date(tokenExpiry).toLocaleString()}`}
              </p>
            </section>
          ) : null}

          <section ref={resultCardRef} className={`surface p-3 sm:p-4 xl:sticky ${tabletView ? "xl:top-2" : "xl:top-4"}`}>
            <p className="text-sm font-semibold text-[var(--color-text)] sm:text-base">Result Card</p>
            {!result ? <p className="mt-2 rounded-xl border border-dashed border-[var(--color-border)] bg-slate-50 p-3 text-sm text-[var(--color-muted)]">No validated reservation yet.</p> : (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-3"><p className="text-xs text-[var(--color-muted)]">Reservation</p><p className="font-semibold">{result.reservation_code}</p></div><div className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-3"><p className="text-xs text-[var(--color-muted)]">Reservation status</p><p className="font-semibold">{resultStatusLabel}</p></div></div>
                <div className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-3"><p className="text-xs text-[var(--color-muted)]">Stay dates</p>{detailLoading ? <div className="mt-1 space-y-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-28" /></div> : <p className="font-semibold">{formatDate(detail?.check_in_date)} - {formatDate(detail?.check_out_date)}</p>}</div>
                <div
                  className={`rounded-xl border p-3 ${
                    flowStatus.tone === "success"
                      ? "border-emerald-200 bg-emerald-50"
                      : flowStatus.tone === "warn"
                        ? "border-amber-200 bg-amber-50"
                        : flowStatus.tone === "error"
                          ? "border-red-200 bg-red-50"
                          : "border-[var(--color-border)] bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-[var(--color-text)]">{flowStatus.label}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">{flowStatus.detail}</p>
                </div>
                {showOverrideFlow ? <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Override reason (min 5 chars)" className="min-h-[84px] w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]/30" /> : null}
                {hasOutstandingBalance && result?.reservation_id ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800">Payment incomplete: {formatPeso(unpaidBalance)} remaining.</p>
                    <p className="mt-1 text-xs text-amber-700">Record remaining payment first to avoid manual override.</p>
                    <Link
                      href={`/admin/payments?source=checkin&reservation_id=${encodeURIComponent(result.reservation_id)}&amount=${encodeURIComponent(String(Math.max(1, Math.round(unpaidBalance))))}&method=cash`}
                      className="mt-2 inline-flex h-10 items-center justify-center rounded-lg border border-amber-400 bg-white px-3 text-sm font-semibold text-amber-900"
                    >
                      Go to Payments
                    </Link>
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {primaryActionKind === "checkout" ? (
                    <button
                      ref={primaryActionRef}
                      type="button"
                      onClick={() => void performCheckout()}
                      disabled={!canDirectCheckout || Boolean(actionBusy) || queueWriteBusy}
                      className="h-11 rounded-xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800 disabled:opacity-40"
                    >
                      {actionBusy === "checkout" ? "Processing..." : networkOnline ? "Check-out" : "Check-out (Queue)"}
                    </button>
                  ) : primaryActionKind === "override" ? (
                    <button
                      ref={primaryActionRef}
                      type="button"
                      onClick={() => void performCheckin()}
                      disabled={Boolean(actionBusy) || queueWriteBusy || pendingQueuedCheckin || overrideReason.trim().length < 5}
                      className="h-11 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-800 disabled:opacity-50"
                    >
                      {actionBusy === "checkin" || queueWriteBusy
                        ? "Processing..."
                        : pendingQueuedCheckin
                          ? "Already queued"
                          : networkOnline
                            ? "Override Check-in (Admin)"
                            : "Confirm Check-in (Queue)"}
                    </button>
                  ) : (
                    <button
                      ref={primaryActionRef}
                      type="button"
                      onClick={() => void performCheckin()}
                      disabled={!canDirectCheckin || Boolean(actionBusy) || queueWriteBusy || pendingQueuedCheckin}
                      className="h-11 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {actionBusy === "checkin" || queueWriteBusy
                        ? "Processing..."
                        : pendingQueuedCheckin
                          ? "Already queued"
                          : networkOnline
                            ? "Confirm Check-in"
                            : "Confirm Check-in (Queue)"}
                    </button>
                  )}
                  <button type="button" onClick={() => void resetAll()} className="h-11 rounded-xl border border-[var(--color-border)] bg-white text-sm font-semibold text-[var(--color-text)]">Rescan / Reset</button>
                </div>
                {pendingQueuedCheckin ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-700">This reservation already has a pending queued check-in.</p>
                    <button
                      type="button"
                      onClick={() => setMode("queue")}
                      className="inline-flex h-8 items-center rounded-md border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-900"
                    >
                      View queue
                    </button>
                  </div>
                ) : null}
                {canCheckout && hasOutstandingBalance && result?.reservation_id ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800">Check-out blocked: outstanding balance {formatPeso(unpaidBalance)}.</p>
                    <p className="mt-1 text-xs text-amber-700">Collect remaining payment before recording check-out.</p>
                    <Link
                      href={`/admin/payments?source=checkout&reservation_id=${encodeURIComponent(result.reservation_id)}&amount=${encodeURIComponent(String(Math.max(1, Math.round(unpaidBalance))))}&method=cash`}
                      className="mt-2 inline-flex h-10 items-center justify-center rounded-lg border border-amber-400 bg-white px-3 text-sm font-semibold text-amber-900"
                    >
                      Go to Payments
                    </Link>
                  </div>
                ) : null}
                <p className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)] sm:text-xs"><Keyboard className="h-3.5 w-3.5" />Shortcuts: R = Rescan, Enter = Confirm</p>
              </div>
            )}
          </section>
        </aside>
      </div>
      <SettingsDrawer
        open={settingsDrawerOpen}
        scannerId={scannerId}
        enableSuccessSound={enableSuccessSound}
        enableVibrate={enableVibrate}
        onClose={() => setSettingsDrawerOpen(false)}
        onScannerIdChange={setScannerId}
        onSoundChange={(next) => {
          setEnableSuccessSound(next);
          try { window.localStorage.setItem("checkin_sound_enabled", next ? "1" : "0"); } catch {}
        }}
        onVibrateChange={(next) => {
          setEnableVibrate(next);
          try { window.localStorage.setItem("checkin_vibrate_enabled", next ? "1" : "0"); } catch {}
        }}
      />
    </section>
  );
}
