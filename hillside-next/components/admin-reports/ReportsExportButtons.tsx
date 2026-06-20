"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import type { ReportDailyItem, ReportMonthlyItem } from "../../../packages/shared/src/types";

type Props = {
  daily: ReportDailyItem[];
  monthly: ReportMonthlyItem[];
  fullWidthMobile?: boolean;
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

export function ReportsExportButtons({ daily, monthly, fullWidthMobile = false }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    setOpen(false);
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
    setOpen(false);
  };

  const disableAll = !daily.length && !monthly.length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className={`relative ${fullWidthMobile ? "w-full lg:w-auto" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disableAll}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] disabled:opacity-50 ${
          fullWidthMobile ? "w-full lg:w-auto" : ""
        }`}
      >
        <Download className="h-4 w-4" />
        <span>Export</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 min-w-[190px] rounded-xl border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-md)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={exportDaily}
            disabled={!daily.length}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-background)] disabled:opacity-50"
          >
            Daily CSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={exportMonthly}
            disabled={!monthly.length}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-background)] disabled:opacity-50"
          >
            Monthly CSV
          </button>
        </div>
      ) : null}
    </div>
  );
}
