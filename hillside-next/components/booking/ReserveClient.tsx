"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Loader2, Pencil, Users } from "lucide-react";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { reservationCreateResponseSchema } from "../../../packages/shared/src/schemas";
import type { ReservationCreateResponse } from "../../../packages/shared/src/types";
import { clearBookingDraft, readBookingDraft, type BookingDraft } from "../../lib/booking/draft";
import { fetchPublicUnitById, unitImageUrl, unitTypeLabel, type PublicUnit } from "../../lib/catalog";
import { getUnitNightlyRate } from "../../lib/booking/pricing";
import { PriceBreakdown } from "./PriceBreakdown";
import { Input } from "../shared/Input";

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function ReserveClient({ token, email }: { token: string; email: string | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [unit, setUnit] = useState<PublicUnit | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = readBookingDraft();
    if (!current) {
      router.replace("/stays");
      return;
    }
    setDraft(current);
    let active = true;
    (async () => {
      const found = await fetchPublicUnitById(current.unitId);
      if (!active) return;
      setUnit(found);
      setLoading(false);
      try {
        const profile = await apiFetch<{ name?: string | null; phone?: string | null }>(
          "/v2/me/profile",
          { method: "GET" },
          token,
        );
        if (active && profile) {
          setName(profile.name || "");
          setPhone(profile.phone || "");
        }
      } catch {
        /* prefill is best-effort */
      }
    })();
    return () => {
      active = false;
    };
  }, [router, token]);

  const nights = draft ? nightsBetween(draft.checkInDate, draft.checkOutDate) : 0;
  const nightlyRate = unit && draft ? getUnitNightlyRate(unit, draft.guestCount) : 0;
  const editHref = useMemo(() => {
    if (!draft) return "/stays";
    const params = new URLSearchParams({
      check_in: draft.checkInDate,
      check_out: draft.checkOutDate,
      guests: String(draft.guestCount),
    });
    return `/stays/${draft.unitId}?${params.toString()}`;
  }, [draft]);

  const confirm = useCallback(async () => {
    if (!draft || !unit) return;
    setBusy(true);
    setError(null);
    try {
      if (name.trim() || phone.trim()) {
        try {
          await apiFetch(
            "/v2/me/profile",
            { method: "PATCH", body: JSON.stringify({ name: name.trim() || null, phone: phone.trim() || null }) },
            token,
          );
        } catch {
          /* contact update is best-effort; don't block the booking */
        }
      }

      const payload = {
        check_in_date: draft.checkInDate,
        check_out_date: draft.checkOutDate,
        unit_ids: [draft.unitId],
        guest_count: draft.guestCount,
        idempotency_key: crypto.randomUUID(),
      };
      const outcome = await syncAwareMutation<typeof payload, ReservationCreateResponse>({
        path: "/v2/reservations",
        method: "POST",
        payload,
        parser: reservationCreateResponseSchema,
        accessToken: token,
        entityType: "reservation",
        action: "reservations.create",
        buildOptimisticResponse: () => ({
          reservation_id: `offline-${crypto.randomUUID()}`,
          reservation_code: "OFFLINE-QUEUED",
          status: "pending_payment",
          escrow_ref: null,
          ai_recommendation: null,
        }),
      });

      clearBookingDraft();
      if (outcome.mode === "online") {
        router.replace(`/reserve/${encodeURIComponent(outcome.data.reservation_id)}/pay`);
      } else {
        router.replace("/my-bookings?tab=pending_payment");
      }
    } catch (unknownError) {
      const message = getApiErrorMessage(unknownError, "Failed to create reservation.");
      if (/(unavailable|not available|fully booked|already booked)/i.test(message)) {
        setError("This stay is no longer available for your dates. Please pick another stay.");
      } else {
        setError(message);
      }
      setBusy(false);
    }
  }, [draft, unit, name, phone, token, router]);

  if (loading || !draft || !unit) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-[1080px] items-center justify-center px-4">
        <p className="flex items-center gap-2 text-sm muted-text">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing your reservation…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Confirm and reserve</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your trip</h2>
              <Link href={editHref} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-secondary)] hover:underline">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-[var(--color-secondary)]" />
                <div>
                  <dt className="font-semibold text-[var(--color-text)]">Dates</dt>
                  <dd className="muted-text">
                    {formatDate(draft.checkInDate)} → {formatDate(draft.checkOutDate)} · {nights}{" "}
                    {nights === 1 ? "night" : "nights"}
                  </dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-[var(--color-secondary)]" />
                <div>
                  <dt className="font-semibold text-[var(--color-text)]">Guests</dt>
                  <dd className="muted-text">
                    {draft.guestCount} {draft.guestCount === 1 ? "guest" : "guests"}
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-semibold">Contact details</h2>
            <p className="mt-1 text-sm muted-text">We&apos;ll use these to reach you about your booking.</p>
            <div className="mt-4 space-y-4">
              <Input label="Email" value={email ?? ""} readOnly disabled />
              <Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
              <Input
                label="Phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. 0917 000 0000"
                inputMode="tel"
              />
            </div>
          </section>
        </div>

        <aside>
          <div className="lg:sticky lg:top-24">
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
              <div className="flex gap-3">
                <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--color-border)]">
                  <Image src={unitImageUrl(unit)} alt={unit.name} fill sizes="96px" className="object-cover" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide muted-text">
                    {unitTypeLabel(unit.type)}
                  </p>
                  <p className="font-semibold leading-snug text-[var(--color-text)]">{unit.name}</p>
                  <p className="text-sm muted-text">Up to {unit.capacity} guests</p>
                </div>
              </div>

              <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                <PriceBreakdown nightlyRate={nightlyRate} nights={nights} guests={draft.guestCount} />
              </div>

              {error ? (
                <p className="mt-4 rounded-xl bg-[color:color-mix(in_srgb,var(--color-error)_10%,white)] px-3 py-2 text-sm text-[var(--color-error)]">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-cta)] text-base font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {busy ? "Reserving…" : "Confirm — continue to payment"}
              </button>
              <p className="mt-2 text-center text-xs muted-text">
                Your spot is held as pending until your deposit is verified.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
