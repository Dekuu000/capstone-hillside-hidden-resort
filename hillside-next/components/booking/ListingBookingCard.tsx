"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { PaxSelector } from "./PaxSelector";
import { PriceBreakdown } from "./PriceBreakdown";
import { getUnitNightlyRate, isPaxPricedUnit } from "../../lib/booking/pricing";
import { writeBookingDraft } from "../../lib/booking/draft";
import { addDaysToIsoDate, todayPlusLocalIsoDate } from "../../lib/dateIso";
import { formatPhpPeso } from "../../lib/formatCurrency";
import type { PublicUnit } from "../../lib/catalog";

type ListingBookingCardProps = {
  unit: PublicUnit;
  isAuthed: boolean;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
};

function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

export function ListingBookingCard({
  unit,
  isAuthed,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
}: ListingBookingCardProps) {
  const router = useRouter();
  const tomorrow = todayPlusLocalIsoDate(1);
  const [checkIn, setCheckIn] = useState(initialCheckIn || tomorrow);
  const [checkOut, setCheckOut] = useState(initialCheckOut || todayPlusLocalIsoDate(3));
  const [guests, setGuests] = useState(initialGuests && initialGuests > 0 ? initialGuests : 2);
  const [error, setError] = useState<string | null>(null);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const nightlyRate = getUnitNightlyRate(unit, guests);
  const paxPriced = isPaxPricedUnit(unit);

  const reserve = () => {
    setError(null);
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setError("Choose valid check-in and check-out dates.");
      return;
    }
    if (guests < 1) {
      setError("Add at least one guest.");
      return;
    }
    if (guests > unit.capacity) {
      setError(`This stay hosts up to ${unit.capacity} guests.`);
      return;
    }
    writeBookingDraft({
      unitId: unit.unit_id,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      guestCount: guests,
    });
    router.push(isAuthed ? "/reserve" : "/login?next=/reserve");
  };

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xl font-semibold text-[var(--color-text)]">
          {formatPhpPeso(nightlyRate)}
          <span className="text-sm font-normal muted-text"> / night</span>
        </p>
        {paxPriced ? <span className="text-xs muted-text">Scales with group size</span> : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FancyDatePicker
          label="Check-in"
          value={checkIn}
          min={tomorrow}
          onChange={(value) => {
            setCheckIn(value);
            if (checkOut && value && checkOut <= value) setCheckOut(addDaysToIsoDate(value, 1));
          }}
        />
        <FancyDatePicker
          label="Check-out"
          value={checkOut}
          min={checkIn ? addDaysToIsoDate(checkIn, 1) : tomorrow}
          onChange={setCheckOut}
        />
      </div>

      <div className="mt-3 rounded-2xl border border-[var(--color-border)] px-4 py-3">
        <PaxSelector
          value={guests}
          onChange={setGuests}
          min={1}
          max={unit.capacity}
          hint={`Up to ${unit.capacity} guests`}
        />
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

      {nights > 0 ? (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <PriceBreakdown nightlyRate={nightlyRate} nights={nights} guests={guests} />
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-xs muted-text">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-secondary)]" />
        <span>
          <span className="font-semibold text-[var(--color-text)]">Secure GCash deposit.</span> Every booking is reviewed by our team before it&apos;s confirmed.
        </span>
      </div>
    </div>
  );
}
