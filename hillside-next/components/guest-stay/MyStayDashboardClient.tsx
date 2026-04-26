"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BedDouble, Clock3, QrCode, Sparkles } from "lucide-react";
import Link from "next/link";
import { welcomeNotificationSchema } from "../../../packages/shared/src/schemas";
import type { WelcomeNotification } from "../../../packages/shared/src/types";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { InsetPanel } from "../shared/InsetPanel";
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
  roomDisplay: string;
  status: string;
  welcomeNotification: WelcomeNotification | null;
};

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
  roomDisplay,
  status,
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">My stay dashboard</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--color-text)]">{reservationCode}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{checkInDate} to {checkOutDate}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Check-in starts at 8:00 AM local time.</p>
          </div>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
            >
              <QrCode className="h-4 w-4" />
              Open Check-in QR
            </button>
            <p className="text-xs text-[var(--color-muted)]">Show this at the front desk during arrival.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InsetPanel>
            <p className="text-xs text-[var(--color-muted)]">Countdown</p>
            <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <Clock3 className="h-4 w-4 text-[var(--color-secondary)]" />
              {countdownLabel}
            </p>
          </InsetPanel>
          <InsetPanel>
            <p className="text-xs text-[var(--color-muted)]">Room</p>
            <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <BedDouble className="h-4 w-4 text-[var(--color-secondary)]" />
              {roomDisplay}
            </p>
          </InsetPanel>
          <InsetPanel>
            <p className="text-xs text-[var(--color-muted)]">Reservation status</p>
            <p className="mt-1 text-sm font-semibold capitalize text-[var(--color-text)]">{formatReservationStatus(status)}</p>
          </InsetPanel>
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
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
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
              className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
            >
              Explore tours
            </Link>
          </article>
        ) : null}
      </section>

      {showQr ? (
        <ModalDialog
          titleId="my-stay-qr-title"
          title="Check-in QR"
          onClose={() => setShowQr(false)}
          maxWidthClass="md:max-w-3xl"
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
