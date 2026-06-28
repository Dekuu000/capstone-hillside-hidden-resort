import type { ReportsOverviewResponse } from "../../../packages/shared/src/types";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { formatDateOnly, formatDateTime } from "../../lib/dateDisplay";
import { HillsideLogo } from "../branding/HillsideLogo";

const RESORT_ADDRESS = "Prk. 7, Jupiter St, Olongapo City, 2200 Zambales";

function pct(value: number) {
  return `${Math.round((value || 0) * 100)}%`;
}

function displayDate(value: string) {
  return formatDateOnly(value, {
    locale: "en-PH",
    fallback: value,
    formatOptions: { month: "short", day: "numeric", year: "numeric" },
  });
}

/** A receipt-style row with a dotted leader between label and value. */
function LeaderLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-[13px]">
      <span className={strong ? "font-semibold text-black" : "text-black"}>{label}</span>
      <span className="mb-[3px] flex-1 border-b border-dotted border-gray-400" aria-hidden="true" />
      <span className={`tabular-nums ${strong ? "text-[15px] font-bold text-black" : "font-semibold text-black"}`}>{value}</span>
    </div>
  );
}

/**
 * Branded, A4 receipt-style financial report. Hidden on screen; printed via the
 * #printable-report container + @media print rules in globals.css. Pure
 * presentational so it can render on the server.
 */
export function ReportDocument({
  overview,
  preparedBy,
  generatedAt,
}: {
  overview: ReportsOverviewResponse;
  preparedBy: string;
  generatedAt: string;
}) {
  const { summary, daily, monthly, from_date, to_date } = overview;
  const netBookings = Math.max(summary.bookings - summary.cancellations, 0);
  const reportRef = `RPT-${from_date.replace(/-/g, "")}-${to_date.replace(/-/g, "")}`;
  const dailyCashTotal = daily.reduce((sum, row) => sum + (row.cash_collected || 0), 0);
  const dailyDiscountTotal = daily.reduce((sum, row) => sum + (row.promo_discounts || 0), 0);
  const grossBooked = summary.unit_booked_value + summary.tour_booked_value;
  const netBooked = grossBooked - summary.promo_discounts;

  return (
    <div className="bg-white text-black">
      <div className="mx-auto max-w-[720px] px-6 py-2 font-sans">
        {/* Letterhead */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
          <div className="flex items-center gap-3">
            <HillsideLogo className="[&_img]:h-12 [&_img]:w-12 [&_.hillside-brand-title]:text-[1.15rem] [&_.hillside-brand-title]:text-black [&_.hillside-brand-subtitle]:text-[0.55rem] [&_.hillside-brand-subtitle]:tracking-[0.28em] [&_.hillside-brand-subtitle]:text-gray-600" />
          </div>
          <div className="text-right text-[11px] leading-4 text-gray-700">
            <p className="font-semibold text-black">Hillside Hidden Resort</p>
            <p>{RESORT_ADDRESS}</p>
            <p>hillsidehidden.resort</p>
          </div>
        </header>

        {/* Title + meta */}
        <div className="mt-4 text-center">
          <h1 className="text-[18px] font-bold uppercase tracking-[0.12em] text-black">Sales &amp; Occupancy Report</h1>
          <p className="mt-1 text-[13px] text-gray-700">
            Period: <span className="font-semibold text-black">{displayDate(from_date)}</span> &ndash;{" "}
            <span className="font-semibold text-black">{displayDate(to_date)}</span>
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1 border-y border-gray-300 py-2 text-[11px] text-gray-700">
          <p>Report ref: <span className="font-semibold text-black">{reportRef}</span></p>
          <p className="text-right">Generated: <span className="font-semibold text-black">{formatDateTime(generatedAt, { locale: "en-PH", fallback: "-" })}</span></p>
          <p>Prepared by: <span className="font-semibold text-black">{preparedBy}</span></p>
          <p className="text-right">Days covered: <span className="font-semibold text-black">{daily.length}</span></p>
        </div>

        {/* Receipt-style summary */}
        <section className="mt-4">
          <h2 className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-600">Summary</h2>
          <p className="mb-1 text-[10px] italic leading-snug text-gray-500">
            Bookings, occupancy &amp; booked value are by stay date (check-in); cash collected is by payment
            date — so prepayments for upcoming stays can appear without a matching booking in the period.
          </p>
          <div className="border-t border-black pt-1">
            <LeaderLine label="Bookings" value={String(summary.bookings)} />
            <LeaderLine label="Cancellations" value={String(summary.cancellations)} />
            <LeaderLine label="Net bookings" value={String(netBookings)} />
            <LeaderLine label="Occupancy rate" value={pct(summary.occupancy_rate)} />
            <LeaderLine label="Unit booked value" value={formatPeso(summary.unit_booked_value)} />
            <LeaderLine label="Tour booked value" value={formatPeso(summary.tour_booked_value)} />
            <LeaderLine label="Gross booked value" value={formatPeso(grossBooked)} />
            <LeaderLine label="Promo discounts" value={`${summary.promo_discounts > 0 ? "−" : ""}${formatPeso(summary.promo_discounts)}`} />
            <LeaderLine label="Net booked value" value={formatPeso(netBooked)} strong />
          </div>
          <div className="mt-1 border-t border-gray-300 pt-1">
            <LeaderLine label="Forfeited deposits (retained)" value={formatPeso(summary.forfeited_deposits)} />
            <LeaderLine label="Refunded deposits (returned)" value={`${summary.refunded_deposits > 0 ? "−" : ""}${formatPeso(summary.refunded_deposits)}`} />
          </div>
          <div className="mt-1 border-t-2 border-double border-black pt-1">
            <LeaderLine label="TOTAL CASH COLLECTED" value={formatPeso(summary.cash_collected)} strong />
          </div>
        </section>

        {/* Daily breakdown */}
        {daily.length ? (
          <section className="mt-4">
            <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-600">Daily breakdown</h2>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-y border-black text-left">
                  <th className="py-1 pr-2 font-semibold">Date</th>
                  <th className="py-1 px-2 text-right font-semibold">Bookings</th>
                  <th className="py-1 px-2 text-right font-semibold">Cancel</th>
                  <th className="py-1 px-2 text-right font-semibold">Occupancy</th>
                  <th className="py-1 px-2 text-right font-semibold">Discounts</th>
                  <th className="py-1 pl-2 text-right font-semibold">Cash</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.report_date} className="border-b border-gray-200">
                    <td className="py-1 pr-2">{displayDate(row.report_date)}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{row.bookings}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{row.cancellations}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{pct(row.occupancy_rate)}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{row.promo_discounts > 0 ? `−${formatPeso(row.promo_discounts)}` : "—"}</td>
                    <td className="py-1 pl-2 text-right tabular-nums">{formatPeso(row.cash_collected)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black font-bold">
                  <td className="py-1 pr-2" colSpan={4}>Total</td>
                  <td className="py-1 px-2 text-right tabular-nums">{dailyDiscountTotal > 0 ? `−${formatPeso(dailyDiscountTotal)}` : "—"}</td>
                  <td className="py-1 pl-2 text-right tabular-nums">{formatPeso(dailyCashTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        ) : null}

        {/* Monthly breakdown */}
        {monthly.length ? (
          <section className="mt-4">
            <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-600">Monthly breakdown</h2>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-y border-black text-left">
                  <th className="py-1 pr-2 font-semibold">Month</th>
                  <th className="py-1 px-2 text-right font-semibold">Bookings</th>
                  <th className="py-1 px-2 text-right font-semibold">Cancel</th>
                  <th className="py-1 pl-2 text-right font-semibold">Cash</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => (
                  <tr key={row.report_month} className="border-b border-gray-200">
                    <td className="py-1 pr-2">{row.report_month}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{row.bookings}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{row.cancellations}</td>
                    <td className="py-1 pl-2 text-right tabular-nums">{formatPeso(row.cash_collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Signatures — blank space above each line for a handwritten signature */}
        <section className="mt-6 grid grid-cols-2 gap-12 text-[12px]">
          <div className="text-center">
            <div className="h-10" aria-hidden="true" />
            <div className="border-t border-black pt-1 font-semibold">Prepared by</div>
            <p className="mt-1 text-gray-600">{preparedBy}</p>
          </div>
          <div className="text-center">
            <div className="h-10" aria-hidden="true" />
            <div className="border-t border-black pt-1 font-semibold">Verified by</div>
            <p className="mt-1 text-gray-600">&nbsp;</p>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-4 border-t border-gray-300 pt-2 text-center text-[10px] text-gray-500">
          <p>This is a system-generated report from Hillside Hidden Resort. Ref {reportRef}.</p>
          <p>Generated {formatDateTime(generatedAt, { locale: "en-PH", fallback: "-" })}.</p>
        </footer>
      </div>
    </div>
  );
}
