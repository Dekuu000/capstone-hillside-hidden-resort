import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, FileText, Loader2, XCircle } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import { AdminLayout } from '../components/layout/AdminLayout';
import { fetchAuditLogs, type AuditLogFilters } from '../services/auditService';
import { formatDateTimeLocal } from '../lib/formatting';
import { useAuth } from '../hooks/useAuth';
import { AvailabilityDatePicker } from '../components/date/AvailabilityRangePicker';
import {
    anchorAuditNow,
    anchorExisting,
    confirmAnchorStatus,
    fetchAuditHashesForAnchor,
    fetchLatestAnchor,
    fetchLatestConfirmedAnchor,
} from '../services/anchorService';
import { sha256Hex } from '../lib/hash';

const ACTION_OPTIONS = [
    'create',
    'verify',
    'reject',
    'cancel',
    'checkin',
    'checkout',
    'override_checkin',
    'approve',
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


function shortenHash(value?: string | null, left = 8, right = 6) {
    if (!value) return '—';
    if (value.length <= left + right) return value;
    return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function buildAnchorPayload(hashes: string[]) {
    return hashes.join('\n');
}

const ANCHOR_STATUS_BADGES: Record<string, { label: string; className: string }> = {
    pending: { label: 'Queued', className: 'bg-yellow-50 text-yellow-700' },
    submitted: { label: 'Submitted', className: 'bg-blue-50 text-blue-700' },
    confirmed: { label: 'Confirmed', className: 'bg-green-50 text-green-700' },
    failed: { label: 'Failed', className: 'bg-red-50 text-red-700' },
};

export function AdminAuditPage() {
    const queryClient = useQueryClient();
    const { user, isAdmin, loading: authLoading } = useAuth();
    const [action, setAction] = useState('');
    const [entityType, setEntityType] = useState('');
    const [anchored, setAnchored] = useState<'' | 'anchored' | 'unanchored'>('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [anchorNotice, setAnchorNotice] = useState<string | null>(null);
    const [anchorError, setAnchorError] = useState<string | null>(null);
    const [verifyResult, setVerifyResult] = useState<string | null>(null);
    const canAnchor = !!user && isAdmin;

    const filters = useMemo<AuditLogFilters>(() => ({
        action: action ? action as AuditLogFilters['action'] : undefined,
        entityType: entityType ? entityType as AuditLogFilters['entityType'] : undefined,
        anchored: anchored ? anchored as AuditLogFilters['anchored'] : undefined,
        fromDate: fromDate ? startOfDayIso(fromDate) : undefined,
        toDate: toDate ? endOfDayIso(toDate) : undefined,
    }), [action, entityType, anchored, fromDate, toDate]);

    const { data, isLoading, error } = useQuery({
        queryKey: ['audit-logs', filters],
        queryFn: async () => fetchAuditLogs(filters),
    });

    const { data: latestAnchor, isLoading: anchorLoading, refetch: refetchAnchor } = useQuery({
        queryKey: ['audit-anchor-latest'],
        queryFn: fetchLatestAnchor,
    });

    const { data: latestConfirmedAnchor, isLoading: confirmedLoading } = useQuery({
        queryKey: ['audit-anchor-confirmed'],
        queryFn: fetchLatestConfirmedAnchor,
    });

    const statusBadge = latestAnchor ? ANCHOR_STATUS_BADGES[latestAnchor.status] : null;

    const anchorNow = useMutation({
        mutationFn: anchorAuditNow,
        onSuccess: (response) => {
            setAnchorError(null);
            setVerifyResult(null);
            if (response?.message) {
                setAnchorNotice(response.message);
            } else {
                const summary = response?.log_count
                    ? `Anchored ${response.log_count} logs. Tx: ${shortenHash(response.tx_hash)}`
                    : 'Anchor submitted.';
                setAnchorNotice(summary);
            }
            refetchAnchor();
            queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
        },
        onError: (err) => {
            setAnchorNotice(null);
            setAnchorError(err instanceof Error ? err.message : 'Failed to anchor audit logs.');
        },
    });

    const confirmAnchor = useMutation({
        mutationFn: async (anchorId: string) => confirmAnchorStatus(anchorId),
        onSuccess: (response) => {
            setAnchorError(null);
            setAnchorNotice(`Anchor status: ${response.status}`);
            refetchAnchor();
        },
        onError: (err) => {
            setAnchorNotice(null);
            setAnchorError(err instanceof Error ? err.message : 'Failed to confirm status.');
        },
    });

    const retryAnchor = useMutation({
        mutationFn: async (anchorId: string) => anchorExisting(anchorId),
        onSuccess: (response) => {
            setAnchorError(null);
            setAnchorNotice(`Retry submitted. Tx: ${shortenHash(response.tx_hash)}`);
            refetchAnchor();
        },
        onError: (err) => {
            setAnchorNotice(null);
            setAnchorError(err instanceof Error ? err.message : 'Failed to retry anchor.');
        },
    });

    const verifyAnchor = useMutation({
        mutationFn: async (anchorId: string) => {
            const logs = await fetchAuditHashesForAnchor(anchorId);
            const hashes = logs.map((log) => log.data_hash.toLowerCase());
            const payload = buildAnchorPayload(hashes);
            const recomputed = await sha256Hex(payload);
            return recomputed;
        },
        onSuccess: (recomputed) => {
            if (!latestAnchor?.root_hash) {
                setVerifyResult('No root hash found for this anchor.');
                return;
            }
            const match = recomputed === latestAnchor.root_hash.toLowerCase();
            setVerifyResult(match ? 'Match: DB root hash verified.' : 'Mismatch: root hash does not match.');
        },
        onError: (err) => {
            setVerifyResult(err instanceof Error ? err.message : 'Failed to verify anchor.');
        },
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

                <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-gray-900">Blockchain Anchoring (Sepolia)</p>
                            <p className="text-xs text-gray-500">
                                Anchors critical audit logs on-chain using a batch root hash. No PII stored on-chain.
                            </p>
                        </div>
                        <button
                            className="btn-primary w-full md:w-auto"
                            disabled={anchorNow.isPending || authLoading || !canAnchor}
                            onClick={() => {
                                setAnchorNotice(null);
                                setAnchorError(null);
                                anchorNow.mutate();
                            }}
                        >
                            {anchorNow.isPending ? 'Anchoring...' : 'Anchor now'}
                        </button>
                    </div>
                    {!authLoading && !canAnchor && (
                        <p className="text-xs text-orange-600">Please sign in as admin.</p>
                    )}

                    {(anchorNotice || anchorError) && (
                        <div className={`text-sm rounded-lg px-3 py-2 ${anchorError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            {anchorError || anchorNotice}
                        </div>
                    )}

                    <div className="border-t border-gray-200 pt-3">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-gray-500">Latest anchor</p>
                                        {statusBadge && (
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge.className}`}>
                                                {statusBadge.label}
                                            </span>
                                        )}
                                    </div>
                                    {anchorLoading ? (
                                        <p className="text-sm text-gray-600">Loading...</p>
                                    ) : latestAnchor ? (
                                        <div className="space-y-1 text-sm text-gray-700">
                                            <p>Logs: {latestAnchor.log_count}</p>
                                            <p>Root: <span className="font-mono">{shortenHash(latestAnchor.root_hash)}</span></p>
                                            <p>Tx: <span className="font-mono">{shortenHash(latestAnchor.tx_hash)}</span></p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">No anchors yet.</p>
                                    )}
                                </div>

                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    <p className="text-xs text-gray-500">Last confirmed anchor</p>
                                    {confirmedLoading ? (
                                        <p className="text-sm text-gray-600">Loading...</p>
                                    ) : latestConfirmedAnchor ? (
                                        <div className="space-y-1 text-sm text-gray-700">
                                            <p>
                                                Confirmed:{' '}
                                                <span className="font-semibold">
                                                    {formatDateTimeLocal(latestConfirmedAnchor.confirmed_at || latestConfirmedAnchor.created_at)}
                                                </span>
                                            </p>
                                            <p>Logs: {latestConfirmedAnchor.log_count}</p>
                                            <p>Root: <span className="font-mono">{shortenHash(latestConfirmedAnchor.root_hash)}</span></p>
                                            <p>Tx: <span className="font-mono">{shortenHash(latestConfirmedAnchor.tx_hash)}</span></p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">No confirmed anchors yet.</p>
                                    )}
                                </div>
                            </div>

                            {latestAnchor && (
                                <div className="flex flex-col sm:flex-row gap-2">
                                    {latestAnchor.status === 'submitted' && (
                                        <button
                                            className="btn-secondary"
                                            onClick={() => confirmAnchor.mutate(latestAnchor.anchor_id)}
                                            disabled={confirmAnchor.isPending}
                                        >
                                            {confirmAnchor.isPending ? 'Confirming...' : 'Confirm status'}
                                        </button>
                                    )}
                                    {latestAnchor.status === 'failed' && (
                                        <button
                                            className="btn-secondary"
                                            onClick={() => retryAnchor.mutate(latestAnchor.anchor_id)}
                                            disabled={retryAnchor.isPending}
                                        >
                                            {retryAnchor.isPending ? 'Retrying...' : 'Retry'}
                                        </button>
                                    )}
                                    <button
                                        className="btn-secondary"
                                        onClick={() => verifyAnchor.mutate(latestAnchor.anchor_id)}
                                        disabled={verifyAnchor.isPending}
                                    >
                                        {verifyAnchor.isPending ? 'Verifying...' : 'Verify (DB)'}
                                    </button>
                                </div>
                            )}
                        </div>
                        {verifyResult && (
                            <div className="mt-3 text-sm text-gray-700">
                                {verifyResult}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
                            <label className="block text-xs font-medium text-gray-600 mb-1">Anchored</label>
                            <select
                                className="input w-full"
                                value={anchored}
                                onChange={(e) => setAnchored(e.target.value as typeof anchored)}
                            >
                                <option value="">All</option>
                                <option value="anchored">Anchored</option>
                                <option value="unanchored">Unanchored</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                            <AvailabilityDatePicker
                                value={fromDate && isValid(parseISO(fromDate)) ? parseISO(fromDate) : undefined}
                                onChange={(date) => {
                                    setFromDate(date ? format(date, 'yyyy-MM-dd') : '');
                                }}
                                placeholder="Select date"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                            <AvailabilityDatePicker
                                value={toDate && isValid(parseISO(toDate)) ? parseISO(toDate) : undefined}
                                onChange={(date) => {
                                    setToDate(date ? format(date, 'yyyy-MM-dd') : '');
                                }}
                                placeholder="Select date"
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
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Anchored</th>
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
                                            <td className="px-6 py-4 text-sm text-gray-700">
                                                {log.anchor_id ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                                                        <CheckCircle className="w-3 h-3" />
                                                        Anchored
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-700">
                                                        <XCircle className="w-3 h-3" />
                                                        Unanchored
                                                    </span>
                                                )}
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
