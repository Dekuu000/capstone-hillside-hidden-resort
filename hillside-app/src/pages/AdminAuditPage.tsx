import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import { fetchAuditLogs, type AuditLogFilters } from '../services/auditService';
import { formatDateTimeLocal } from '../lib/formatting';

const ACTION_OPTIONS = [
    'create',
    'verify',
    'reject',
    'cancel',
    'checkin',
    'checkout',
    'override_checkin',
    'update',
];

const ENTITY_OPTIONS = ['reservation', 'payment', 'checkin', 'unit'];

function endOfDayIso(date: string) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
}

function startOfDayIso(date: string) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

function formatReference(log: { entity_id: string; metadata?: any }) {
    return log?.metadata?.reservation_code
        || log?.metadata?.reservation_id
        || log.entity_id;
}

function formatMetadata(log: { metadata?: any }) {
    if (!log?.metadata) return '—';
    const meta = log.metadata;
    const parts: string[] = [];
    if (meta.payment_type) parts.push(`type=${meta.payment_type}`);
    if (meta.amount) parts.push(`amount=${meta.amount}`);
    if (meta.method) parts.push(`method=${meta.method}`);
    if (meta.override) parts.push('override=true');
    return parts.length > 0 ? parts.join(' • ') : '—';
}

export function AdminAuditPage() {
    const [action, setAction] = useState('');
    const [entityType, setEntityType] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const filters = useMemo<AuditLogFilters>(() => ({
        action: action ? action as AuditLogFilters['action'] : undefined,
        entityType: entityType ? entityType as AuditLogFilters['entityType'] : undefined,
        fromDate: fromDate ? startOfDayIso(fromDate) : undefined,
        toDate: toDate ? endOfDayIso(toDate) : undefined,
    }), [action, entityType, fromDate, toDate]);

    const { data, isLoading, error } = useQuery({
        queryKey: ['audit-logs', filters],
        queryFn: async () => fetchAuditLogs(filters),
    });

    if (error) {
        return (
            <AdminLayout>
                <div className="text-center py-12">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Error Loading Audit Logs</h2>
                    <p className="text-gray-600 mt-2">{(error as Error).message}</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
                    <p className="text-gray-600">Review system actions and compliance events</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
                            <select
                                className="input w-full"
                                value={action}
                                onChange={(e) => setAction(e.target.value)}
                            >
                                <option value="">All actions</option>
                                {ACTION_OPTIONS.map((value) => (
                                    <option key={value} value={value}>{value}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Entity</label>
                            <select
                                className="input w-full"
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value)}
                            >
                                <option value="">All entities</option>
                                {ENTITY_OPTIONS.map((value) => (
                                    <option key={value} value={value}>{value}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                            <input
                                className="input w-full"
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                            <input
                                className="input w-full"
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : data && data.length > 0 ? (
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Time</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Action</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Entity</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Reference</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Performed By</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {data.map((log) => (
                                        <tr key={log.audit_id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 text-sm text-gray-700">
                                                {formatDateTimeLocal(log.timestamp)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700">{log.action}</td>
                                            <td className="px-6 py-4 text-sm text-gray-700">{log.entity_type}</td>
                                            <td className="px-6 py-4 text-sm text-gray-700 font-mono">
                                                {formatReference(log)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700">
                                                {log.performed_by?.name || log.performed_by?.email || 'System'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {formatMetadata(log)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No audit logs found</h3>
                        <p className="text-gray-500">Try adjusting your filters.</p>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
