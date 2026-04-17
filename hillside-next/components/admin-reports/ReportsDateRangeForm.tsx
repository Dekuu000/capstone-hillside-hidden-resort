"use client";

import { useMemo, useState } from "react";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { Button } from "../shared/Button";
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
    <form method="get" className="mb-5 grid gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm lg:grid-cols-12">
      <div className="lg:col-span-12">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quick range</p>
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
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition ${
                activePreset === preset.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3">
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
      <div className="lg:col-span-3">
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

      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />

      <div className="flex items-end lg:col-span-2">
        {hasChanges ? (
          <span className="mr-2 hidden text-xs font-semibold text-amber-700 lg:inline">Date range changed</span>
        ) : null}
        <Button type="submit" variant="secondary" className="h-10 w-full rounded-lg border-slate-300 bg-slate-900 px-4 text-white hover:bg-slate-800">
          Apply range
        </Button>
      </div>

      <div className="flex items-end justify-start lg:col-span-4 lg:justify-end">
        <ReportsExportButtons daily={daily} monthly={monthly} compact />
      </div>
    </form>
  );
}
