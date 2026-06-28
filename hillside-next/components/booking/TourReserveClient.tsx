"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Loader2, Pencil, Users } from "lucide-react";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { redirectToGcashOrPay } from "../../lib/booking/gcashCheckout";
import { promoValidationResultSchema, reservationCreateResponseSchema } from "../../../packages/shared/src/schemas";
import type { PromoValidationResult, ReservationCreateResponse, ServiceItem } from "../../../packages/shared/src/types";
import { clearTourDraft, readTourDraft, type TourDraft } from "../../lib/booking/tourDraft";
import { fetchPublicServiceById, tourImageUrl, tourSchedule } from "../../lib/catalog";
import { tourMinPayNow, tourTotal } from "../../lib/booking/pricing";
import { formatPhpPeso } from "../../lib/formatCurrency";
import { DepositPolicyDialog } from "./DepositPolicyDialog";
import { Input } from "../shared/Input";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function TourReserveClient({ token, email }: { token: string; email: string | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<TourDraft | null>(null);
  const [service, setService] = useState<ServiceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<PromoValidationResult | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  useEffect(() => {
    const current = readTourDraft();
    if (!current) {
      router.replace("/tours");
      return;
    }
    setDraft(current);
    let active = true;
    (async () => {
      const found = await fetchPublicServiceById(current.serviceId);
      if (!active) return;
      setService(found);
      setLoading(false);
      // Auto-apply preview: surface any active no-code seasonal sale for tours.
      try {
        const gross = found ? tourTotal(found, current.adultQty, current.kidQty) : 0;
        if (gross > 0) {
          const auto = await apiFetch(
            "/v2/promos/validate",
            { method: "POST", body: JSON.stringify({ code: "", total: gross, kind: "tours" }) },
            token,
            promoValidationResultSchema,
          );
          if (active && auto.valid && auto.discount_amount > 0) setPromo(auto);
        }
      } catch {
        /* auto-promo preview is best-effort */
      }
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

  const grossTotal = draft && service ? tourTotal(service, draft.adultQty, draft.kidQty) : 0;
  const discount = promo?.valid ? promo.discount_amount : 0;
  const total = Math.max(0, grossTotal - discount);
  const minPay = tourMinPayNow(total);
  const balanceDue = Math.max(0, total - minPay);

  const applyPromo = useCallback(async () => {
    const code = promoInput.trim();
    if (!code) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const result = await apiFetch(
        "/v2/promos/validate",
        { method: "POST", body: JSON.stringify({ code, total: grossTotal, kind: "tours" }) },
        token,
        promoValidationResultSchema,
      );
      if (result.valid) {
        setPromo(result);
        setPromoError(null);
      } else {
        setPromo(null);
        setPromoError(result.message || "This promo code is not valid.");
      }
    } catch (unknownError) {
      setPromo(null);
      setPromoError(getApiErrorMessage(unknownError, "Couldn't check that code."));
    } finally {
      setPromoBusy(false);
    }
  }, [promoInput, grossTotal, token]);

  const removePromo = useCallback(() => {
    setPromo(null);
    setPromoInput("");
    setPromoError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!draft || !service) return;
    setBusy(true);
    setError(null);
    try {
      // Persist contact details in the background — best-effort, and must not sit on
      // the critical path before payment. Fire it concurrently with the booking
      // create so it never adds a round-trip to the GCash redirect.
      if (name.trim() || phone.trim()) {
        void apiFetch(
          "/v2/me/profile",
          { method: "PATCH", body: JSON.stringify({ name: name.trim() || null, phone: phone.trim() || null }) },
          token,
        ).catch(() => {
          /* contact update is best-effort */
        });
      }

      const payload = {
        service_id: draft.serviceId,
        visit_date: draft.visitDate,
        adult_qty: draft.adultQty,
        kid_qty: draft.kidQty,
        is_advance: true,
        expected_pay_now: minPay,
        notes: null,
        idempotency_key: crypto.randomUUID(),
        promo_code: promo?.valid ? promo.code : null,
      };
      const outcome = await syncAwareMutation<typeof payload, ReservationCreateResponse>({
        path: "/v2/reservations/tours",
        method: "POST",
        payload,
        parser: reservationCreateResponseSchema,
        accessToken: token,
        entityType: "reservation",
        action: "reservations.tours.create",
        buildOptimisticResponse: () => ({
          reservation_id: `offline-${crypto.randomUUID()}`,
          reservation_code: "OFFLINE-QUEUED",
          status: "pending_payment",
          escrow_ref: null,
          ai_recommendation: null,
        }),
      });

      clearTourDraft();
      if (outcome.mode === "online") {
        // One tap: go straight to GCash; fall back to the pay page if the
        // gateway is unavailable. (Stays on busy — the page is leaving.)
        await redirectToGcashOrPay(outcome.data.reservation_id, token, (rid) =>
          router.replace(`/reserve/${encodeURIComponent(rid)}/pay`),
        );
      } else {
        router.replace("/my-bookings?tab=pending_payment");
      }
    } catch (unknownError) {
      setError(getApiErrorMessage(unknownError, "Failed to reserve this tour."));
      // Drop back to the page so the card-level error is visible behind the modal.
      setPolicyOpen(false);
      setBusy(false);
    }
  }, [draft, service, name, phone, minPay, token, router, promo]);

  if (loading || !draft || !service) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-[1080px] items-center justify-center px-4">
        <p className="flex items-center gap-2 text-sm muted-text">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing your tour reservation…
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
              <h2 className="text-lg font-semibold">Your tour</h2>
              <Link href={`/tours/${draft.serviceId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-secondary)] hover:underline">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-[var(--color-secondary)]" />
                <div>
                  <dt className="font-semibold text-[var(--color-text)]">Visit date</dt>
                  <dd className="muted-text">{formatDate(draft.visitDate)}</dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-[var(--color-secondary)]" />
                <div>
                  <dt className="font-semibold text-[var(--color-text)]">Guests</dt>
                  <dd className="muted-text">
                    {draft.adultQty} adult{draft.adultQty === 1 ? "" : "s"}
                    {draft.kidQty > 0 ? ` · ${draft.kidQty} child${draft.kidQty === 1 ? "" : "ren"}` : ""}
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-semibold">Contact details</h2>
            <p className="mt-1 text-sm muted-text">We&apos;ll use these to reach you about your tour.</p>
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
                  <Image src={tourImageUrl(service)} alt={service.service_name} fill sizes="96px" className="object-cover" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide muted-text">Day pass</p>
                  <p className="font-semibold leading-snug text-[var(--color-text)]">{service.service_name}</p>
                  <p className="text-sm muted-text">{tourSchedule(service)}</p>
                </div>
              </div>

              <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                {promo?.valid ? (
                  <div className="mb-3 flex items-center justify-between rounded-xl bg-[color:color-mix(in_srgb,var(--color-secondary)_10%,white)] px-3 py-2 text-sm">
                    <span className="font-semibold text-[var(--color-secondary)]">
                      {promo.code ? `${promo.code} applied` : "Seasonal sale applied"}
                    </span>
                    <button
                      type="button"
                      onClick={removePromo}
                      className="text-xs font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="mb-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void applyPromo();
                          }
                        }}
                        placeholder="Promo code"
                        className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text)] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--color-muted)] focus:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-secondary)_25%,white)]"
                      />
                      <button
                        type="button"
                        onClick={() => void applyPromo()}
                        disabled={promoBusy || !promoInput.trim()}
                        className="h-10 shrink-0 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-secondary)] transition hover:bg-[var(--color-background)] disabled:opacity-50"
                      >
                        {promoBusy ? "…" : "Apply"}
                      </button>
                    </div>
                    {promoError ? <p className="mt-1.5 text-xs text-[var(--color-error)]">{promoError}</p> : null}
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="muted-text">Tour total</span>
                    <span className="font-semibold text-[var(--color-text)]">{formatPhpPeso(grossTotal)}</span>
                  </div>
                  {discount > 0 ? (
                    <div className="flex items-center justify-between text-[var(--color-secondary)]">
                      <span className="font-semibold">Promo{promo?.code ? ` (${promo.code})` : ""}</span>
                      <span className="font-semibold">−{formatPhpPeso(discount)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 font-semibold text-[var(--color-text)]">
                    <span>Total</span>
                    <span>{formatPhpPeso(total)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-[color:color-mix(in_srgb,var(--color-secondary)_10%,white)] px-3 py-2">
                    <span className="muted-text">Due now to reserve</span>
                    <span className="font-semibold text-[var(--color-text)]">{formatPhpPeso(minPay)}</span>
                  </div>
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-xl bg-[color:color-mix(in_srgb,var(--color-error)_10%,white)] px-3 py-2 text-sm text-[var(--color-error)]">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => setPolicyOpen(true)}
                disabled={busy}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {busy ? "Redirecting to GCash…" : `Pay ${formatPhpPeso(minPay)} with GCash`}
              </button>
              <p className="mt-2 text-center text-xs muted-text">
                Secured by PayMongo · GCash. Deposit is non-refundable if you cancel.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <DepositPolicyDialog
        open={policyOpen}
        payNow={minPay}
        balanceDue={balanceDue}
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPolicyOpen(false)}
      />
    </div>
  );
}
