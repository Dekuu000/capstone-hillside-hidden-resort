"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { ReportDailyItem, ReportMonthlyItem } from "../../../packages/shared/src/types";
import { Button } from "../shared/Button";

type Props = {
  daily: ReportDailyItem[];
  monthly: ReportMonthlyItem[];
  compact?: boolean;
};

function toCsv(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escapeValue = (value: string | number) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escapeValue(row[key] ?? "")).join(",")),
  ];
  return lines.join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ReportsExportButtons({ daily, monthly, compact = false }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const exportDaily = () => {
    downloadCsv(
      "reports-daily.csv",
      toCsv(
        daily.map((row) => ({
          date: row.report_date,
          bookings: row.bookings,
          cancellations: row.cancellations,
          cash_collected_php: row.cash_collected,
          occupancy_rate: row.occupancy_rate,
          unit_booked_value_php: row.unit_booked_value,
          tour_booked_value_php: row.tour_booked_value,
        })),
      ),
    );
    setMobileOpen(false);
  };

  const exportMonthly = () => {
    downloadCsv(
      "reports-monthly.csv",
      toCsv(
        monthly.map((row) => ({
          month: row.report_month,
          bookings: row.bookings,
          cancellations: row.cancellations,
          cash_collected_php: row.cash_collected,
          occupancy_rate: row.occupancy_rate,
          unit_booked_value_php: row.unit_booked_value,
          tour_booked_value_php: row.tour_booked_value,
        })),
      ),
    );
    setMobileOpen(false);
  };

  const disableAll = !daily.length && !monthly.length;

  useEffect(() => {
    if (!mobileOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!mobileMenuRef.current) return;
      if (!mobileMenuRef.current.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [mobileOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={mobileMenuRef} className="relative sm:hidden">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={compact ? "h-8 px-2.5 text-xs" : undefined}
          disabled={disableAll}
          leftSlot={<Download className="h-4 w-4" />}
          onClick={() => setMobileOpen((prev) => !prev)}
        >
          Export
        </Button>
        {mobileOpen ? (
          <div className="absolute left-0 top-full z-40 mt-2 min-w-[170px] rounded-xl border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-md)]">
            <button
              type="button"
              onClick={exportDaily}
              disabled={!daily.length}
              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--color-text)] hover:bg-slate-50 disabled:opacity-50"
            >
              Export Daily CSV
            </button>
            <button
              type="button"
              onClick={exportMonthly}
              disabled={!monthly.length}
              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--color-text)] hover:bg-slate-50 disabled:opacity-50"
            >
              Export Monthly CSV
            </button>
          </div>
        ) : null}
      </div>

      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={compact ? "h-8 px-2.5 text-xs" : undefined}
        onClick={exportDaily}
        disabled={!daily.length}
        leftSlot={<Download className="h-4 w-4" />}
      >
        {compact ? "Daily CSV" : "Export Daily CSV"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={compact ? "h-8 px-2.5 text-xs" : undefined}
        onClick={exportMonthly}
        disabled={!monthly.length}
        leftSlot={<Download className="h-4 w-4" />}
      >
        {compact ? "Monthly CSV" : "Export Monthly CSV"}
      </Button>
      </div>
    </div>
  );
}
