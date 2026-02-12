import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, FileDown } from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import { fetchPaymentTransactionsInRange, fetchReservationsInRange, fetchVerifiedPaymentsInRange } from '../services/reportsService';
import { formatPeso } from '../lib/formatting';
import { buildReportInsights } from '../lib/insights';

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
            const [reservations, payments] = await Promise.all([
                fetchReservationsInRange(range.fromIso, range.toIso),
                fetchVerifiedPaymentsInRange(range.fromIso, range.toIso),
            ]);
            return { reservations, payments };
        },
    });

    const summary = useMemo(() => {
        const reservations = data?.reservations ?? [];
        const payments = data?.payments ?? [];

        const totalBookings = reservations.length;
        const confirmedBookings = reservations.filter((r) =>
            ['confirmed', 'checked_in', 'checked_out'].includes(r.status)
        ).length;
        const cancelledBookings = reservations.filter((r) =>
            ['cancelled', 'no_show'].includes(r.status)
        ).length;
        const pendingBookings = reservations.filter((r) =>
            ['pending_payment', 'for_verification'].includes(r.status)
        ).length;
        const verifiedRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

        return {
            totalBookings,
            confirmedBookings,
            cancelledBookings,
            pendingBookings,
            verifiedRevenue,
        };
    }, [data]);

    async function handleExportSummary() {
        const rows = [[
            fromDate,
            toDate,
            summary.totalBookings,
            summary.confirmedBookings,
            summary.cancelledBookings,
            summary.pendingBookings,
            summary.verifiedRevenue,
        ]];
        const csv = buildCsv(
            ['from_date', 'to_date', 'total_bookings', 'confirmed_bookings', 'cancelled_bookings', 'pending_bookings', 'verified_revenue'],
            rows
        );
        downloadCsv(`hillside-summary-${fromDate}-to-${toDate}.csv`, csv);
    }

    async function handleExportTransactions() {
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
                            <button type="button" className="btn-secondary w-full" onClick={handleExportSummary}>
                                <FileDown className="w-4 h-4 mr-2" />
                                Export Summary CSV
                            </button>
                            <button type="button" className="btn-secondary w-full" onClick={handleExportTransactions}>
                                <FileDown className="w-4 h-4 mr-2" />
                                Export Transactions CSV
                            </button>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Total Bookings</p>
                            <p className="text-2xl font-bold text-gray-900">{summary.totalBookings}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Confirmed Bookings</p>
                            <p className="text-2xl font-bold text-gray-900">{summary.confirmedBookings}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Cancelled / No-show</p>
                            <p className="text-2xl font-bold text-gray-900">{summary.cancelledBookings}</p>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <p className="text-xs text-gray-500">Verified Revenue</p>
                            <p className="text-2xl font-bold text-gray-900">{formatPeso(summary.verifiedRevenue)}</p>
                        </div>
                    </div>
                )}

                {!isLoading && summary.pendingBookings > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-4 text-sm text-gray-600">
                        Pending bookings in range: <span className="font-semibold text-gray-900">{summary.pendingBookings}</span>
                    </div>
                )}

                {!isLoading && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-3">Insights</h2>
                        <div className="space-y-3">
                            {buildReportInsights(summary).map((insight, idx) => (
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
