"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, QrCode, Sparkles } from "lucide-react";
import Link from "next/link";
import { welcomeNotificationSchema } from "../../../packages/shared/src/schemas";
import type { WelcomeNotification } from "../../../packages/shared/src/types";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatDateOnly } from "../../lib/dateDisplay";
import { formatPhpPeso } from "../../lib/formatCurrency";

const LONG_DATE: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { ModalDialog } from "../shared/ModalDialog";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { useToast } from "../shared/ToastProvider";
import { GuestOfflineQrCard } from "./GuestOfflineQrCard";

type Props = {
  accessToken: string | null;
  reservationId: string;
  reservationCode: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  amountPaid: number;
  balanceDue: number;
  welcomeNotification: WelcomeNotification | null;
};

function statusToneClass(status: string) {
  const s = status.toLowerCase();
  if (["confirmed", "checked_in", "checked_out", "completed"].includes(s)) return "bg-emerald-100 text-emerald-800";
  if (["pending_payment", "for_verification"].includes(s)) return "bg-amber-100 text-amber-800";
  if (["cancelled", "no_show"].includes(s)) return "bg-rose-100 text-rose-800";
  return "bg-[var(--color-background)] text-[var(--color-text)]";
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function buildCheckInTarget(checkInDate: string) {
  return new Date(`${checkInDate}T08:00:00+08:00`);
}

function formatReservationStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function MyStayDashboardClient({
  accessToken,
  reservationId,
  reservationCode,
  checkInDate,
  checkOutDate,
  status,
  amountPaid,
  balanceDue,
  welcomeNotification,
}: Props) {
  const { showToast } = useToast();
  const [showQr, setShowQr] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [welcomeCard, setWelcomeCard] = useState<WelcomeNotification | null>(welcomeNotification);
  const [dismissBusy, setDismissBusy] = useState(false);
  const networkOnline = useNetworkOnline();

  useEffect(() => {
    setWelcomeCard(welcomeNotification);
  }, [welcomeNotification]);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const checkInTarget = useMemo(() => buildCheckInTarget(checkInDate), [checkInDate]);
  const remainingSeconds = Math.ceil((checkInTarget.getTime() - (nowMs ?? checkInTarget.getTime())) / 1000);

  const countdownLabel = nowMs === null
    ? "Preparing check-in timer..."
    : remainingSeconds > 0
      ? `Check-in opens in ${formatDuration(remainingSeconds)}`
      : "You may now check in";
  const visibleWelcome = welcomeCard && !welcomeCard.read_at ? welcomeCard : null;

  const dismissWelcome = useCallback(async () => {
    if (!accessToken || !visibleWelcome || dismissBusy) return;
    setDismissBusy(true);
    try {
      await apiFetch(
        `/v2/me/welcome/${encodeURIComponent(visibleWelcome.notification_id)}/read`,
        { method: "PATCH", body: JSON.stringify({}) },
        accessToken,
        welcomeNotificationSchema,
      );
      setWelcomeCard((prev) => (prev ? { ...prev, read_at: new Date().toISOString() } : prev));
    } catch (error) {
      showToast({
        type: "error",
        title: "Unable to dismiss",
        message: getApiErrorMessage(error, "Try again."),
      });
    } finally {
      setDismissBusy(false);
    }
  }, [accessToken, dismissBusy, showToast, visibleWelcome]);

  return (
    <>
      <section className="surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-[var(--color-text)]">{reservationCode}</h2>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusToneClass(status)}`}>
                {formatReservationStatus(status)}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {formatDateOnly(checkInDate, { formatOptions: LONG_DATE })} to{" "}
              {formatDateOnly(checkOutDate, { formatOptions: LONG_DATE })}
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <Clock3 className="h-3.5 w-3.5 text-[var(--color-secondary)]" />
              {countdownLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowQr(true)}
            aria-label="Open Check-in QR"
            title="Open Check-in QR"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-[var(--color-cta)] transition hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-cta)]/35"
          >
            <QrCode className="h-4 w-4 stroke-[2.2]" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--color-background)] px-3 py-2.5">
          <p className="text-sm text-[var(--color-muted)]">
            Paid <span className="font-semibold text-[var(--color-text)]">{formatPhpPeso(amountPaid)}</span>
            {balanceDue > 0 ? (
              <>
                {" · "}Balance <span className="font-semibold text-[var(--color-text)]">{formatPhpPeso(balanceDue)}</span>
              </>
            ) : null}
          </p>
          <Link
            href="/my-bookings"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-secondary)] hover:underline"
          >
            Manage in My Trips
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {!networkOnline ? (
          <SyncAlertBanner
            className="mt-3 px-3 py-2"
            message="You are offline. QR refresh and welcome updates may be delayed until internet returns."
            showSyncCta
            messageClassName="text-xs text-amber-800"
            syncLinkClassName="h-7 px-3 text-[11px] font-semibold"
          />
        ) : null}

        {visibleWelcome ? (
          <article className="mt-4 rounded-xl border border-[var(--color-secondary-soft)] bg-[var(--color-secondary-ghost)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-secondary)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Welcome
                </p>
                <h3 className="mt-1 text-sm font-semibold text-[var(--color-text)]">{visibleWelcome.title}</h3>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{visibleWelcome.message}</p>
              </div>
              <button
                type="button"
                onClick={() => void dismissWelcome()}
                disabled={dismissBusy}
                className="guest-secondary-cta guest-secondary-cta-sm"
              >
                {dismissBusy ? "Dismissing..." : "Dismiss"}
              </button>
            </div>
            {visibleWelcome.suggestions.length ? (
              <ul className="mt-3 space-y-2 text-sm text-[var(--color-text)]">
                {visibleWelcome.suggestions.slice(0, 2).map((item) => (
                  <li key={item.code} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
                    <p className="font-semibold">{item.title}</p>
                    {item.description ? <p className="mt-0.5 text-xs text-[var(--color-muted)]">{item.description}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              href="/tours"
              className="guest-primary-cta mt-3"
            >
              Explore tours
            </Link>
          </article>
        ) : null}
      </section>

      {showQr ? (
        <ModalDialog
          titleId="my-stay-qr-title"
          title="Your check-in pass"
          onClose={() => setShowQr(false)}
          maxWidthClass="md:max-w-2xl"
          overlayClassName="bg-slate-900/55"
          panelClassName="border-[var(--color-border)] bg-white"
          closeLabel="Close check-in QR dialog"
          closeButtonClassName="border-[var(--color-border)] text-[var(--color-muted)]"
        >
          <GuestOfflineQrCard
            accessToken={accessToken}
            reservationId={reservationId}
            reservationCode={reservationCode}
          />
        </ModalDialog>
      ) : null}
    </>
  );
}
