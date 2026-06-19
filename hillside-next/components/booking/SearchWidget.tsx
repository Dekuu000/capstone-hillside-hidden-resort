"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { PaxSelector } from "./PaxSelector";
import { addDaysToIsoDate, todayPlusLocalIsoDate } from "../../lib/dateIso";

type SearchWidgetProps = {
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  className?: string;
};

export function SearchWidget({
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  className,
}: SearchWidgetProps) {
  const router = useRouter();
  const tomorrow = todayPlusLocalIsoDate(1);
  const [checkIn, setCheckIn] = useState(initialCheckIn || tomorrow);
  const [checkOut, setCheckOut] = useState(initialCheckOut || todayPlusLocalIsoDate(3));
  const [guests, setGuests] = useState(initialGuests && initialGuests > 0 ? initialGuests : 2);

  const submit = () => {
    const safeCheckIn = checkIn || tomorrow;
    let safeCheckOut = checkOut;
    if (!safeCheckOut || safeCheckOut <= safeCheckIn) {
      safeCheckOut = addDaysToIsoDate(safeCheckIn, 1);
    }
    const params = new URLSearchParams({
      check_in: safeCheckIn,
      check_out: safeCheckOut,
      guests: String(guests),
    });
    router.push(`/stays?${params.toString()}`);
  };

  return (
    <div
      className={`rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-lg)] ${className || ""}`}
    >
      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
        <div className="rounded-2xl border border-[var(--color-border)] px-4 py-2.5">
          <span className="block text-xs font-semibold uppercase tracking-wide muted-text">Where</span>
          <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
            <MapPin className="h-3.5 w-3.5 text-[var(--color-secondary)]" />
            Hillside Hidden Resort
          </span>
        </div>

        <FancyDatePicker
          label="Check-in"
          value={checkIn}
          min={tomorrow}
          onChange={(value) => {
            setCheckIn(value);
            if (checkOut && value && checkOut <= value) {
              setCheckOut(addDaysToIsoDate(value, 1));
            }
          }}
        />
        <FancyDatePicker
          label="Check-out"
          value={checkOut}
          min={checkIn ? addDaysToIsoDate(checkIn, 1) : tomorrow}
          onChange={setCheckOut}
        />

        <div className="flex items-end gap-3">
          <PaxSelector value={guests} onChange={setGuests} min={1} max={50} />
          <button
            type="button"
            onClick={submit}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--color-cta)] px-5 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--color-cta)_30%,white)]"
          >
            <Search className="h-4 w-4" />
            <span className="md:hidden lg:inline">Search</span>
          </button>
        </div>
      </div>
    </div>
  );
}
