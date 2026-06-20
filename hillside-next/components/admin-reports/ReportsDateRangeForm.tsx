"use client";

import { useMemo, useState } from "react";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { PrintReportButton } from "./PrintReportButton";
import { ReportsExportButtons } from "./ReportsExportButtons";
import type { ReportDailyItem, ReportMonthlyItem } from "../../../packages/shared/src/types";

type Props = {
  fromDate: string;
  toDate: string;
  daily: ReportDailyItem[];
  monthly: ReportMonthlyItem[];
};

export function ReportsDateRangeForm({ fromDate, toDate, daily, monthly }: Props) {
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);
  const [activePreset, setActivePreset] = useState<"custom" | "today" | "7d" | "month">("custom");

  const hasChanges = useMemo(() => from !== fromDate || to !== toDate, [from, fromDate, to, toDate]);

  const toIso = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const applyPreset = (preset: "today" | "7d" | "month") => {
    const now = new Date();
    const end = toIso(now);
    if (preset === "today") {
      setFrom(end);
      setTo(end);
      setActivePreset(preset);
      return;
    }
    if (preset === "7d") {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      setFrom(toIso(start));
      setTo(end);
      setActivePreset(preset);
      return;
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setFrom(toIso(start));
    setTo(end);
    setActivePreset(preset);
  };

  return (
    <form method="get" className="mb-5 space-y-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Quick range</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { id: "today", label: "Today" },
            { id: "7d", label: "Last 7D" },
            { id: "month", label: "This Month" },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id as "today" | "7d" | "month")}
              className={`inline-flex h-9 items-center rounded-full border px-4 text-xs font-semibold transition ${
                activePreset === preset.id
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:border-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] hover:bg-[var(--color-background)]"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-end lg:gap-3">
          <div className="lg:w-[190px]">
            <FancyDatePicker
              label="From"
              value={from}
              onChange={(next) => {
                setFrom(next);
                setActivePreset("custom");
              }}
              max={to || undefined}
            />
          </div>
          <div className="lg:w-[190px]">
            <FancyDatePicker
              label="To"
              value={to}
              onChange={(next) => {
                setTo(next);
                setActivePreset("custom");
              }}
              min={from || undefined}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] sm:col-span-2 lg:col-span-1 lg:w-auto lg:min-w-[150px]"
          >
            Apply range
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0">
          <PrintReportButton fromDate={from} toDate={to} />
          <ReportsExportButtons daily={daily} monthly={monthly} fromDate={from} toDate={to} fullWidthMobile />
        </div>
      </div>

      {hasChanges ? (
        <p className="text-xs font-semibold text-amber-700">Date range changed. Click Apply range to refresh reports.</p>
      ) : null}
    </form>
  );
}
