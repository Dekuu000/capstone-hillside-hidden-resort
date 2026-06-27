"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { reservationListItemSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";

type Phase = "verifying" | "confirmed" | "timeout";

/**
 * Payment-success landing. We NEVER mark a payment paid here — PayMongo's webhook
 * does that. This page just polls the booking until the webhook has confirmed it,
 * then points the guest to their check-in QR.
 */
export function PaymentResultClient({ token, reservationId }: { token: string; reservationId: string }) {
  const [phase, setPhase] = useState<Phase>("verifying");
  const [code, setCode] = useState("");
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let attempts = 0;

    const tick = async () => {
      if (stopped.current) return;
      attempts += 1;
      try {
        const data = await apiFetch(
          `/v2/me/bookings/${encodeURIComponent(reservationId)}`,
          { method: "GET" },
          token,
          reservationListItemSchema,
        );
        setCode(data.reservation_code || "");
        const paid = Number(data.amount_paid_verified ?? 0);
        const st = String(data.status || "").toLowerCase();
        if (paid > 0 || ["confirmed", "checked_in", "checked_out"].includes(st)) {
          setPhase("confirmed");
          stopped.current = true;
          return;
        }
      } catch {
        // keep polling — transient errors are fine
      }
      if (attempts >= 20) {
        setPhase("timeout");
        stopped.current = true;
        return;
      }
      window.setTimeout(tick, 3000);
    };

    void tick();
    return () => {
      stopped.current = true;
    };
  }, [reservationId, token]);

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-16 text-center">
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
        {phase === "verifying" ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-[var(--color-secondary)]" />
            <h1 className="mt-4 text-xl font-semibold">Verifying your payment…</h1>
            <p className="mt-2 text-sm muted-text">
              We&apos;re confirming your GCash payment with PayMongo. This usually takes a few seconds — please keep this
              page open.
            </p>
          </>
        ) : null}

        {phase === "confirmed" ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-semibold">Payment successful</h1>
            <p className="mt-2 text-sm muted-text">
              Your reservation{code ? ` (${code})` : ""} is confirmed and secured. Your check-in QR code is ready —
              show it to the resort on arrival.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/guest/my-stay"
                className="flex h-12 items-center justify-center rounded-2xl bg-[var(--color-cta)] text-base font-semibold text-white transition hover:brightness-95"
              >
                View my stay &amp; QR code
              </Link>
              <Link href="/my-bookings" className="text-sm font-semibold text-[var(--color-secondary)] hover:underline">
                Go to my trips
              </Link>
            </div>
          </>
        ) : null}

        {phase === "timeout" ? (
          <>
            <Clock className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="mt-4 text-xl font-semibold">Still verifying your payment</h1>
            <p className="mt-2 text-sm muted-text">
              Your payment is taking a little longer to confirm. If you completed the GCash payment, it will appear
              shortly — check My Trips in a moment.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/my-bookings"
                className="flex h-12 items-center justify-center rounded-2xl border border-[var(--color-border)] text-base font-semibold transition hover:bg-[var(--color-background)]"
              >
                Go to my trips
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
