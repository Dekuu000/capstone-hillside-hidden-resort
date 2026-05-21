"use client";

import { CalendarDays, QrCode, Wallet } from "lucide-react";
import { cn } from "../../lib/cn";

type StaySnapshotCardProps = {
  nextStayDate: string;
  outstandingBalance: string;
  qrStatus: string;
  dark?: boolean;
  testId?: string;
};

export function StaySnapshotCard({
  nextStayDate,
  outstandingBalance,
  qrStatus,
  dark = false,
  testId = "stay-snapshot-card",
}: StaySnapshotCardProps) {
  return (
    <article
      data-testid={testId}
      className={cn(
        "w-full rounded-[1.5rem] border shadow-sm",
        dark
          ? "border-white/15 bg-white/8 p-4 text-white backdrop-blur"
          : "ml-auto max-w-[380px] rounded-3xl border-slate-200/80 bg-white/95 p-5 text-[var(--color-text)] backdrop-blur",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full", dark ? "bg-teal-300/15 text-teal-300" : "bg-teal-50 text-[var(--color-secondary)]")}>
          <CalendarDays className="h-5 w-5" />
        </span>
        <h2 className={cn("font-bold", dark ? "text-lg text-white" : "text-lg text-[var(--color-primary)]")}>Stay snapshot</h2>
      </div>

      <div className={cn("mt-4 divide-y text-sm", dark ? "divide-white/12 text-white/75" : "divide-slate-100 text-slate-600")}>
        <div className="flex items-center justify-between py-2.5 lg:py-2">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4" />
            <span>Next stay date</span>
          </div>
          <span className={cn("font-semibold", dark ? "text-white" : "text-slate-800")}>{nextStayDate}</span>
        </div>
        <div className="flex items-center justify-between py-2.5 lg:py-2">
          <div className="flex items-center gap-3">
            <Wallet className="h-4 w-4" />
            <span>Outstanding balance</span>
          </div>
          <span className={cn("font-bold", dark ? "text-white" : "text-[var(--color-primary)]")}>{outstandingBalance}</span>
        </div>
        <div className="flex items-center justify-between py-2.5 lg:py-2">
          <div className="flex items-center gap-3">
            <QrCode className="h-4 w-4" />
            <span>QR status</span>
          </div>
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", dark ? "bg-white/15 text-white" : "border border-slate-200 bg-slate-50 text-slate-700")}>
            {qrStatus}
          </span>
        </div>
      </div>
    </article>
  );
}
