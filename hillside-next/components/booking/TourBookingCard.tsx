"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { PaxSelector } from "./PaxSelector";
import { tourMinPayNow, tourTotal } from "../../lib/booking/pricing";
import { writeTourDraft } from "../../lib/booking/tourDraft";
import { todayPlusLocalIsoDate } from "../../lib/dateIso";
import { formatPhpPeso } from "../../lib/formatCurrency";
import type { ServiceItem } from "../../../packages/shared/src/types";

type TourBookingCardProps = {
  service: ServiceItem;
  isAuthed: boolean;
  initialVisitDate?: string;
};

export function TourBookingCard({ service, isAuthed, initialVisitDate }: TourBookingCardProps) {
  const router = useRouter();
  const tomorrow = todayPlusLocalIsoDate(1);
  const [visitDate, setVisitDate] = useState(initialVisitDate || tomorrow);
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const maxPax = Number(service.max_pax || 0) || 99;
  const total = useMemo(() => tourTotal(service, adults, kids), [service, adults, kids]);
  const minPay = tourMinPayNow(total);
  const adultRate = Number(service.adult_rate || 0);
  const kidRate = Number(service.kid_rate || 0);

  const reserve = () => {
    setError(null);
    if (!visitDate) {
      setError("Choose a visit date.");
      return;
    }
    if (adults < 1) {
      setError("At least one adult is required.");
      return;
    }
    if (adults + kids > maxPax) {
      setError(`This tour hosts up to ${maxPax} guests.`);
      return;
    }
    if (total <= 0) {
      setError("This tour has no published rate yet — please contact the front desk.");
      return;
    }
    writeTourDraft({ serviceId: service.service_id, visitDate, adultQty: adults, kidQty: kids });
    router.push(isAuthed ? "/tours/reserve" : "/login?next=/tours/reserve");
  };

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
      <p className="text-xl font-semibold text-[var(--color-text)]">
        {adultRate > 0 ? formatPhpPeso(adultRate) : "—"}
        <span className="text-sm font-normal muted-text"> / adult</span>
      </p>
      {kidRate > 0 ? (
        <p className="text-sm muted-text">{formatPhpPeso(kidRate)} / child</p>
      ) : null}

      <div className="mt-4">
        <FancyDatePicker label="Visit date" value={visitDate} min={tomorrow} onChange={setVisitDate} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--color-border)] px-4 py-3">
          <PaxSelector value={adults} onChange={setAdults} min={1} max={maxPax} label="Adults" />
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] px-4 py-3">
          <PaxSelector value={kids} onChange={setKids} min={0} max={maxPax} label="Children" />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-[color:color-mix(in_srgb,var(--color-error)_10%,white)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={reserve}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--color-cta)] text-base font-semibold text-white transition hover:brightness-95 focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--color-cta)_30%,white)]"
      >
        Reserve
      </button>
      <p className="mt-2 text-center text-xs muted-text">You won&apos;t be charged yet</p>

      {total > 0 ? (
        <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="muted-text">
              {adults} adult{adults === 1 ? "" : "s"}
              {kids > 0 ? ` · ${kids} child${kids === 1 ? "" : "ren"}` : ""}
            </span>
            <span className="font-semibold text-[var(--color-text)]">{formatPhpPeso(total)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[color:color-mix(in_srgb,var(--color-secondary)_10%,white)] px-3 py-2">
            <span className="muted-text">Due now to reserve</span>
            <span className="font-semibold text-[var(--color-text)]">{formatPhpPeso(minPay)}</span>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-xs muted-text">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-secondary)]" />
        <span>
          <span className="font-semibold text-[var(--color-text)]">Secure deposit.</span> Every booking is reviewed by our team before it&apos;s confirmed.
        </span>
      </div>
    </div>
  );
}
