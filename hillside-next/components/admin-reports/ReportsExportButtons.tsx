"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import type { ReportDailyItem, ReportMonthlyItem } from "../../../packages/shared/src/types";

type Props = {
  daily: ReportDailyItem[];
  monthly: ReportMonthlyItem[];
  fromDate: string;
  toDate: string;
  fullWidthMobile?: boolean;
};

const RESORT_ADDRESS = "Prk. 7, Jupiter St, Olongapo City, 2200 Zambales";

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function csvLine(cells: Array<string | number>) {
  return cells.map(csvCell).join(",");
}

/** Build a templated report CSV: letterhead + meta, then headers, rows, totals. */
function buildReportCsv(opts: {
  title: string;
  fromDate: string;
  toDate: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  totals?: Array<string | number>;
}) {
  const lines: string[] = [
    csvLine(["Hillside Hidden Resort"]),
    csvLine([RESORT_ADDRESS]),
    csvLine([opts.title]),
    csvLine(["Period", `${opts.fromDate} to ${opts.toDate}`]),
    csvLine(["Generated", new Date().toLocaleString("en-PH")]),
    "",
    csvLine(opts.columns),
    ...opts.rows.map((row) => csvLine(row)),
  ];
  if (opts.totals) lines.push(csvLine(opts.totals));
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

function sum<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + (pick(row) || 0), 0);
}

export function ReportsExportButtons({ daily, monthly, fromDate, toDate, fullWidthMobile = false }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const exportDaily = () => {
    downloadCsv(
      "reports-daily.csv",
      buildReportCsv({
        title: "Sales & Occupancy Report — Daily",
        fromDate,
        toDate,
        columns: [
          "date",
          "bookings",
          "cancellations",
          "cash_collected_php",
          "occupancy_rate",
          "unit_booked_value_php",
          "tour_booked_value_php",
          "promo_discounts_php",
          "net_booked_value_php",
        ],
        rows: daily.map((row) => [
          row.report_date,
          row.bookings,
          row.cancellations,
          row.cash_collected,
          row.occupancy_rate,
          row.unit_booked_value,
          row.tour_booked_value,
          row.promo_discounts,
          row.unit_booked_value + row.tour_booked_value - row.promo_discounts,
        ]),
        totals: [
          "Total",
          sum(daily, (r) => r.bookings),
          sum(daily, (r) => r.cancellations),
          sum(daily, (r) => r.cash_collected),
          "",
          sum(daily, (r) => r.unit_booked_value),
          sum(daily, (r) => r.tour_booked_value),
          sum(daily, (r) => r.promo_discounts),
          sum(daily, (r) => r.unit_booked_value + r.tour_booked_value - r.promo_discounts),
        ],
      }),
    );
    setOpen(false);
  };

  const exportMonthly = () => {
    downloadCsv(
      "reports-monthly.csv",
      buildReportCsv({
        title: "Sales & Occupancy Report — Monthly",
        fromDate,
        toDate,
        columns: [
          "month",
          "bookings",
          "cancellations",
          "cash_collected_php",
          "occupancy_rate",
          "unit_booked_value_php",
          "tour_booked_value_php",
          "promo_discounts_php",
          "net_booked_value_php",
        ],
        rows: monthly.map((row) => [
          row.report_month,
          row.bookings,
          row.cancellations,
          row.cash_collected,
          row.occupancy_rate,
          row.unit_booked_value,
          row.tour_booked_value,
          row.promo_discounts,
          row.unit_booked_value + row.tour_booked_value - row.promo_discounts,
        ]),
        totals: [
          "Total",
          sum(monthly, (r) => r.bookings),
          sum(monthly, (r) => r.cancellations),
          sum(monthly, (r) => r.cash_collected),
          "",
          sum(monthly, (r) => r.unit_booked_value),
          sum(monthly, (r) => r.tour_booked_value),
          sum(monthly, (r) => r.promo_discounts),
          sum(monthly, (r) => r.unit_booked_value + r.tour_booked_value - r.promo_discounts),
        ],
      }),
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
