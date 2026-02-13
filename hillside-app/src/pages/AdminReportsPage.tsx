import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, FileDown } from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import {
    fetchPaymentTransactionsInRange,
    fetchReportDaily,
    fetchReportMonthly,
    fetchReportSummary,
} from '../services/reportsService';
import { formatPeso } from '../lib/formatting';
import { buildAnalyticsInsights } from '../lib/insights';

function toStartOfDayIso(date: string) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

function toEndOfDayIso(date: string) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
}

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}

function buildCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
    const escape = (value: string | number | null | undefined) => {
        const safe = value === null || value === undefined ? '' : String(value);
        if (safe.includes('"') || safe.includes(',') || safe.includes('\n')) {
            return `"${safe.replace(/"/g, '""')}"`;
        }
        return safe;
    };
    return [headers.join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
}

function downloadCsv(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function formatPercent(value: number) {
    return `${(value * 100).toFixed(0)}%`;
}

export function AdminReportsPage() {
    const [fromDate, setFromDate] = useState(daysAgoIsoDate(7));
    const [toDate, setToDate] = useState(todayIsoDate());

    const range = useMemo(() => ({
        fromIso: toStartOfDayIso(fromDate),
        toIso: toEndOfDayIso(toDate),
    }), [fromDate, toDate]);

    const { data, isLoading, error } = useQuery({
        queryKey: ['reports', range.fromIso, range.toIso],
        queryFn: async () => {
            const [summary, daily, monthly] = await Promise.all([
                fetchReportSummary(fromDate, toDate),
                fetchReportDaily(fromDate, toDate),
                fetchReportMonthly(fromDate, toDate),
            ]);
            return { summary, daily, monthly };
        },
    });

    const summary = data?.summary ?? {
        bookings: 0,
        cancellations: 0,
        cash_collected: 0,
        occupancy_rate: 0,
        unit_booked_value: 0,
        tour_booked_value: 0,
    };

    const daily = data?.daily ?? [];
    const monthly = data?.monthly ?? [];
    const maxDailyCash = Math.max(1, ...daily.map((row) => row.cash_collected ?? 0));
    const rangeError = new Date(fromDate) > new Date(toDate);
    const hasReportData = daily.length > 0 || monthly.length > 0;

    async function handleExportSummary() {
        if (rangeError) return;
        const rows = (daily.length > 0 ? daily : [{
            report_date: fromDate,
            bookings: summary.bookings,
            cancellations: summary.cancellations,
            cash_collected: summary.cash_collected,
            occupancy_rate: summary.occupancy_rate,
            unit_booked_value: summary.unit_booked_value,
            tour_booked_value: summary.tour_booked_value,
        }]).map((row) => ([
            row.report_date,
            row.bookings,
            row.cancellations,
            row.cash_collected,
            row.occupancy_rate,
            row.unit_booked_value,
            row.tour_booked_value,
        ]));
        const csv = buildCsv(
            ['report_date', 'bookings', 'cancellations', 'cash_collected', 'occupancy_rate', 'unit_booked_value', 'tour_booked_value'],
            rows
        );
        downloadCsv(`hillside-summary-${fromDate}-to-${toDate}.csv`, csv);
    }

    async function handleExportTransactions() {
        if (rangeError) return;
        const transactions = await fetchPaymentTransactionsInRange(range.fromIso, range.toIso);
        const rows = transactions.map((t) => ([
            t.reservation?.reservation_code || '',
            t.payment_type,
            t.method,
            t.amount,
            t.status,
            t.created_at,
            t.verified_at || '',
        ]));
        const csv = buildCsv(
            ['reservation_code', 'payment_type', 'method', 'amount', 'status', 'created_at', 'verified_at'],
            rows
        );
        downloadCsv(`hillside-transactions-${fromDate}-to-${toDate}.csv`, csv);
    }

    if (error) {
        return (
            <AdminLayout>
                <div className="text-center py-12">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Error Loading Reports</h2>
                    <p className="text-gray-600 mt-2">{(error as Error).message}</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
                    <p className="text-gray-600">Anonymized aggregates for bookings and revenue</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                            <input
                                type="date"
                                className="input w-full"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                            <input
                                type="date"
                                className="input w-full"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                className="btn-secondary w-full"
                                onClick={handleExportSummary}
                                disabled={isLoading || rangeError}
                            >
                                <FileDown className="w-4 h-4 mr-2" />
                                Export Summary CSV
                            </button>
                            <button
                                type="button"
                                className="btn-secondary w-full"
                                onClick={handleExportTransactions}
                                disabled={isLoading || rangeError}
                            >
                                <FileDown className="w-4 h-4 mr-2" />
                                Export Transactions CSV
                            </button>
                        </div>
                    </div>
                    {rangeError && (
                        <p className="text-xs text-orange-600 mt-2">
                            Please choose a valid date range (From should not be after To).
                        </p>
                    )}
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : !hasReportData ? (
                    <div className="bg-white rounded-xl shadow-sm p-6 text-center text-sm text-gray-500">
                        No report data available for the selected range.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Total Bookings</p>
                            <p className="text-2xl font-bold text-gray-900">{summary.bookings}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Cancellations</p>
                            <p className="text-2xl font-bold text-gray-900">{summary.cancellations}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Cash Collected</p>
                            <p className="text-2xl font-bold text-gray-900">{formatPeso(summary.cash_collected)}</p>
                        </div>
                    </div>
                )}

                {!isLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Occupancy Rate</p>
                            <p className="text-2xl font-bold text-gray-900">{formatPercent(summary.occupancy_rate)}</p>
                            <p className="text-xs text-gray-500 mt-1">Units booked / active units per day</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Unit Booked Value</p>
                            <p className="text-2xl font-bold text-gray-900">{formatPeso(summary.unit_booked_value)}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Tour Booked Value</p>
                            <p className="text-2xl font-bold text-gray-900">{formatPeso(summary.tour_booked_value)}</p>
                        </div>
                    </div>
                )}

                {!isLoading && daily.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Revenue</h2>
                        <div className="space-y-3">
                            {daily.map((row) => {
                                const cashValue = row.cash_collected ?? 0;
                                const percent = maxDailyCash > 0 ? (cashValue / maxDailyCash) * 100 : 0;
                                return (
                                    <div key={row.report_date} className="flex items-center gap-3">
                                    <div className="w-24 text-xs text-gray-500">{row.report_date}</div>
                                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                        <div
                                            className="h-2 rounded-full bg-primary"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                    <div className="w-24 text-right text-xs font-medium text-gray-700">
                                        {formatPeso(cashValue)}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {!isLoading && monthly.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Summary</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-gray-500 uppercase border-b">
                                    <tr>
                                        <th className="text-left py-2 pr-4">Month</th>
                                        <th className="text-left py-2 pr-4">Bookings</th>
                                        <th className="text-left py-2 pr-4">Cancellations</th>
                                        <th className="text-left py-2 pr-4">Cash Collected</th>
                                        <th className="text-left py-2 pr-4">Occupancy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthly.map((row) => (
                                        <tr key={row.report_month} className="border-b last:border-b-0">
                                            <td className="py-2 pr-4">{row.report_month}</td>
                                            <td className="py-2 pr-4">{row.bookings}</td>
                                            <td className="py-2 pr-4">{row.cancellations}</td>
                                            <td className="py-2 pr-4">{formatPeso(row.cash_collected)}</td>
                                            <td className="py-2 pr-4">{formatPercent(row.occupancy_rate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {!isLoading && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-3">Insights</h2>
                        <div className="space-y-3">
                            {buildAnalyticsInsights({
                                bookings: summary.bookings,
                                cancellations: summary.cancellations,
                                cashCollected: summary.cash_collected,
                                occupancyRate: summary.occupancy_rate,
                                unitBookedValue: summary.unit_booked_value,
                                tourBookedValue: summary.tour_booked_value,
                            }).map((insight, idx) => (
                                <div
                                    key={`${insight.title}-${idx}`}
                                    className={`rounded-lg border p-3 text-sm ${
                                        insight.tone === 'warning'
                                            ? 'border-orange-200 bg-orange-50 text-orange-800'
                                            : insight.tone === 'positive'
                                                ? 'border-green-200 bg-green-50 text-green-800'
                                                : 'border-gray-200 bg-gray-50 text-gray-700'
                                    }`}
                                >
                                    <p className="font-semibold">{insight.title}</p>
                                    <p className="text-xs mt-1">{insight.detail}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
