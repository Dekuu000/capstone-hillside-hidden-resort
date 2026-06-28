"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, QrCode, Receipt, Wallet } from "lucide-react";
import { cn } from "../../lib/cn";

export type StayChargeLine = {
  id: string;
  label: string;
  amount: string;
};

type StaySnapshotCardProps = {
  nextStayDate: string;
  outstandingBalance: string;
  qrStatus: string;
  /** Formatted total of in-stay add-on charges (e.g. "₱900"); omit/null to hide the row. */
  stayChargesTotal?: string | null;
  /** Itemized add-on lines revealed when the guest expands the charges row. */
  stayChargeLines?: StayChargeLine[];
  dark?: boolean;
  testId?: string;
};

export function StaySnapshotCard({
  nextStayDate,
  outstandingBalance,
  qrStatus,
  stayChargesTotal = null,
  stayChargeLines = [],
  dark = false,
  testId = "stay-snapshot-card",
}: StaySnapshotCardProps) {
  const [chargesOpen, setChargesOpen] = useState(false);
  const hasCharges = Boolean(stayChargesTotal);

  return (
    <article
      data-testid={testId}
      className={cn(
        "w-full rounded-[1.5rem] border shadow-sm",
        dark
          ? "border-white/15 bg-white/8 p-4 text-white backdrop-blur"
          : "rounded-3xl border-[var(--color-border)] bg-white/95 p-5 text-[var(--color-text)] backdrop-blur lg:ml-auto lg:max-w-[380px]",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full", dark ? "bg-teal-300/15 text-teal-300" : "bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]")}>
          <CalendarDays className="h-5 w-5" />
        </span>
        <h2 className={cn("font-bold", dark ? "text-lg text-white" : "text-lg text-[var(--color-primary)]")}>Your stay</h2>
      </div>

      <div className={cn("mt-4 divide-y text-sm lg:mt-5", dark ? "divide-white/12 text-white/75" : "divide-[var(--color-border)] text-[var(--color-muted)]")}>
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4" />
            <span>Next stay date</span>
          </div>
          <span className={cn("font-semibold", dark ? "text-white" : "text-[var(--color-text)]")}>{nextStayDate}</span>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <Wallet className="h-4 w-4" />
            <span>Outstanding balance</span>
          </div>
          <span className={cn("font-bold", dark ? "text-white" : "text-[var(--color-primary)]")}>{outstandingBalance}</span>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <QrCode className="h-4 w-4" />
            <span>QR status</span>
          </div>
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", dark ? "bg-white/15 text-white" : "border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)]")}>
            {qrStatus}
          </span>
        </div>

        {hasCharges ? (
          <div className="py-2.5">
            <button
              type="button"
              onClick={() => setChargesOpen((open) => !open)}
              aria-expanded={chargesOpen}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-3">
                <Receipt className="h-4 w-4" />
                <span>Stay charges</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn("font-bold", dark ? "text-white" : "text-[var(--color-primary)]")}>{stayChargesTotal}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", chargesOpen && "rotate-180")} aria-hidden="true" />
              </span>
            </button>
            {chargesOpen ? (
              <div className="mt-2 pl-7">
                <p className={cn("text-[11px]", dark ? "text-white/60" : "text-[var(--color-muted)]")}>
                  Added during your stay, settled at check-out.
                </p>
                <ul className="mt-1.5 space-y-1 text-xs">
                  {stayChargeLines.map((line) => (
                    <li key={line.id} className="flex items-center justify-between gap-2">
                      <span className={cn("min-w-0 truncate", dark ? "text-white/80" : "text-[var(--color-text)]")}>{line.label}</span>
                      <span className={cn("shrink-0 font-medium", dark ? "text-white" : "text-[var(--color-text)]")}>{line.amount}</span>
                    </li>
                  ))}
                  <li className={cn("flex items-center justify-between gap-2 border-t pt-1.5 font-semibold", dark ? "border-white/12 text-white" : "border-[var(--color-border)] text-[var(--color-text)]")}>
                    <span>To settle at check-out</span>
                    <span>{stayChargesTotal}</span>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
