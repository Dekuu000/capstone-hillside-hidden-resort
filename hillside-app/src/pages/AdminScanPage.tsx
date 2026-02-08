import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../components/layout/AdminLayout';
import { usePerformCheckin, useValidateQrCheckin } from '../features/reservations/useReservations';
import type { QrCheckinValidation } from '../services/reservationsService';
import { AlertCircle, CheckCircle, Loader2, QrCode, Camera, WifiOff } from 'lucide-react';
import { formatDateWithWeekday } from '../lib/validation';
import { formatPeso } from '../lib/paymentUtils';
import { Html5Qrcode } from 'html5-qrcode';
import { loadScanQueue, removeScanFromQueue, updateScanInQueue, upsertScanToQueue, type ScanQueueItem } from '../lib/offlineScanQueue';

export function AdminScanPage() {
    const [reservationCode, setReservationCode] = useState('');
    const [scanResult, setScanResult] = useState<QrCheckinValidation | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [overrideReason, setOverrideReason] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [scanSuccess, setScanSuccess] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
    const [queue, setQueue] = useState<ScanQueueItem[]>(() => loadScanQueue());
    const [queueReason, setQueueReason] = useState<Record<string, string>>({});
    const [queueNotice, setQueueNotice] = useState<string | null>(null);
    const [syncNotice, setSyncNotice] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [queueFilter, setQueueFilter] = useState<'all' | 'queued' | 'failed' | 'needs_reason' | 'expired'>('all');
    const validateQr = useValidateQrCheckin();
    const performCheckin = usePerformCheckin();
    const qrRef = useRef<Html5Qrcode | null>(null);
    const syncRef = useRef(false);

    function resetScan() {
        setReservationCode('');
        setScanResult(null);
        setScanError(null);
        setScanSuccess(null);
        setOverrideReason('');
        setIsScanning(false);
    }

    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    useEffect(() => {
        if (!isOnline) return;
        const interval = setInterval(() => {
            syncQueue(false);
        }, 10000);
        return () => clearInterval(interval);
    }, [isOnline, queue]);

    async function syncQueue(showSummary = false) {
        if (syncRef.current) return;
        if (!navigator.onLine) {
            if (showSummary) setSyncNotice("You're offline. Items will sync when online.");
            return;
        }
        const items = loadScanQueue();
        if (items.length === 0) return;

        syncRef.current = true;
        if (showSummary) setSyncing(true);
        let next = items;
        let synced = 0;
        let failed = 0;
        let needsReason = 0;

        for (const item of items) {
            if (item.status === 'expired') continue;
            if (item.status === 'needs_reason' && !item.overrideReason) {
                needsReason += 1;
                continue;
            }
            if (item.status === 'failed' && item.attempts >= 5) {
                failed += 1;
                continue;
            }
            if (item.status === 'syncing') continue;

            next = updateScanInQueue(item.id, { status: 'syncing', lastError: null });
            setQueue(next);

            try {
                const result = await validateQr.mutateAsync(item.reservationCode);
                if (!result || !result.reservation_id) {
                    const attempts = (item.attempts || 0) + 1;
                    next = updateScanInQueue(item.id, {
                        status: attempts >= 5 ? 'failed' : 'failed',
                        lastError: attempts >= 5 ? 'Max attempts reached. Retry manually.' : 'Reservation not found',
                        attempts,
                    });
                    setQueue(next);
                    failed += 1;
                    continue;
                }

                if (result.allowed) {
                    await performCheckin.mutateAsync({ reservationId: result.reservation_id, overrideReason: null });
                    next = removeScanFromQueue(item.id);
                    setQueue(next);
                    synced += 1;
                    continue;
                }

                if (result.can_override) {
                    if (!item.overrideReason) {
                        next = updateScanInQueue(item.id, {
                            status: 'needs_reason',
                            lastError: 'Override required',
                            guestName: result.guest_name ?? null,
                        });
                        setQueue(next);
                        needsReason += 1;
                        continue;
                    }
                    await performCheckin.mutateAsync({
                        reservationId: result.reservation_id,
                        overrideReason: item.overrideReason,
                    });
                    next = removeScanFromQueue(item.id);
                    setQueue(next);
                    synced += 1;
                    continue;
                }

                const attempts = (item.attempts || 0) + 1;
                next = updateScanInQueue(item.id, {
                    status: attempts >= 5 ? 'failed' : 'failed',
                    lastError: attempts >= 5 ? 'Max attempts reached. Retry manually.' : (result.reason || 'Check-in blocked'),
                    attempts,
                    guestName: result.guest_name ?? null,
                });
                setQueue(next);
                failed += 1;
            } catch (err) {
                const attempts = (item.attempts || 0) + 1;
                next = updateScanInQueue(item.id, {
                    status: attempts >= 5 ? 'failed' : 'failed',
                    lastError: attempts >= 5 ? 'Max attempts reached. Retry manually.' : (err instanceof Error ? err.message : 'Sync failed'),
                    attempts,
                });
                setQueue(next);
                failed += 1;
            }
        }

        syncRef.current = false;
        if (showSummary) {
            setSyncing(false);
            setSyncNotice(`Synced ${synced} items, ${failed} failed, ${needsReason} pending reason.`);
        }
    }

    useEffect(() => {
        if (!isScanning) return;

        const qr = new Html5Qrcode('qr-reader');
        qrRef.current = qr;

        qr.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: 240 },
            async (decodedText) => {
                setIsScanning(false);
                setReservationCode(decodedText);
                try {
                    await qr.stop();
                } catch {
                    // Ignore stop errors
                }
                try {
                    await qr.clear();
                } catch {
                    // Ignore clear errors
                }
                qrRef.current = null;
            },
            () => {
                // ignore scan errors to avoid noisy UI
            }
        ).catch((err) => {
            setScanError(err?.message || 'Camera access failed.');
            setIsScanning(false);
        });

        return () => {
            if (qrRef.current) {
                qrRef.current.stop().catch(() => undefined);
                try {
                    qrRef.current.clear();
                } catch {
                    // Ignore clear errors
                }
                qrRef.current = null;
            }
        };
    }, [isScanning]);

    async function handleValidate() {
        setScanError(null);
        setScanSuccess(null);
        setScanResult(null);
        setQueueNotice(null);
        if (!reservationCode.trim()) {
            setScanError('Please enter or scan a reservation code.');
            return;
        }
        if (!navigator.onLine) {
            const { deduped, removed } = upsertScanToQueue(reservationCode.trim());
            setQueue(loadScanQueue());
            const messages: string[] = [];
            if (deduped) {
                messages.push('Already queued — updated timestamp.');
            } else {
                messages.push(`Offline: queued ${reservationCode.trim()} for sync.`);
            }
            if (removed > 0) {
                messages.push(`Queue limit reached. Removed ${removed} oldest item(s).`);
            }
            setQueueNotice(messages.join(' '));
            return;
        }
        try {
            const result = await validateQr.mutateAsync(reservationCode.trim());
            setScanResult(result);
        } catch (err) {
            setScanError(err instanceof Error ? err.message : 'Failed to validate QR.');
        }
    }

    async function handleCheckin() {
        if (!scanResult?.reservation_id) return;
        setScanError(null);
        setScanSuccess(null);
        try {
            await performCheckin.mutateAsync({
                reservationId: scanResult.reservation_id,
                overrideReason: scanResult.can_override ? overrideReason.trim() : null,
            });
            setScanSuccess(scanResult.can_override ? 'Override check-in recorded.' : 'Check-in successful.');
            setOverrideReason('');
            const refreshed = await validateQr.mutateAsync(scanResult.reservation_code);
            setScanResult(refreshed);
        } catch (err) {
            setScanError(err instanceof Error ? err.message : 'Check-in failed.');
        }
    }

    const filteredQueue = queueFilter === 'all'
        ? queue
        : queue.filter((item) => item.status === queueFilter);

    return (
        <AdminLayout>
            <div className="space-y-6 max-w-3xl">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Scan Check-in</h1>
                    <p className="text-gray-600 mt-1">Scan a guest QR or enter the reservation code to validate.</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                    {!isOnline && (
                        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                            <WifiOff className="w-4 h-4 mt-0.5" />
                            Offline: scans will be queued and synced when back online.
                        </div>
                    )}
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Reservation Code</label>
                            <input
                                className="input w-full"
                                value={reservationCode}
                                onChange={(e) => setReservationCode(e.target.value)}
                                placeholder="e.g., HR-20260208-XXXX"
                            />
                        </div>
                        <button
                            type="button"
                            className="btn-primary md:mt-6"
                            onClick={handleValidate}
                            disabled={validateQr.isPending}
                        >
                            {validateQr.isPending ? 'Validating...' : 'Validate'}
                        </button>
                        <button
                            type="button"
                            className="btn-secondary md:mt-6"
                            onClick={resetScan}
                        >
                            Reset
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                            onClick={() => setIsScanning((prev) => !prev)}
                        >
                            <Camera className="w-4 h-4" />
                            {isScanning ? 'Stop Camera' : 'Scan with Camera'}
                        </button>
                        <p className="text-xs text-gray-500">Use the device camera to read the QR code.</p>
                    </div>

                    {validateQr.isPending && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Validating reservation code...
                        </div>
                    )}

                    {isScanning && (
                        <div className="border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50">
                            <div id="qr-reader" className="w-full" />
                        </div>
                    )}
                </div>

                {(scanError || scanSuccess) && (
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${scanError ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                        {scanError ? (
                            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                        ) : (
                            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                        )}
                        <p className={`text-sm ${scanError ? 'text-red-700' : 'text-green-700'}`}>
                            {scanError || scanSuccess}
                        </p>
                    </div>
                )}

                {queueNotice && (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
                        {queueNotice}
                    </div>
                )}

                {syncNotice && (
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
                        {syncNotice}
                    </div>
                )}

                {queue.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">Queued Scans</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => syncQueue(true)}
                                    disabled={syncing}
                                >
                                    {syncing ? 'Syncing...' : 'Sync now'}
                                </button>
                                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                                    {queue.length} queued
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <label className="text-xs text-gray-500">Filter:</label>
                            <select
                                className="input h-9 py-1 px-2 text-sm w-40"
                                value={queueFilter}
                                onChange={(e) => setQueueFilter(e.target.value as typeof queueFilter)}
                            >
                                <option value="all">All</option>
                                <option value="queued">Queued</option>
                                <option value="needs_reason">Needs reason</option>
                                <option value="failed">Failed</option>
                                <option value="expired">Expired</option>
                            </select>
                        </div>
                        <div className="space-y-3">
                            {filteredQueue.map((item) => (
                                <div key={item.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-gray-900">{item.reservationCode}</p>
                                            {item.guestName && (
                                                <p className="text-xs text-gray-500">Guest: {item.guestName}</p>
                                            )}
                                            <p className="text-xs text-gray-500">Scanned: {new Date(item.scannedAt).toLocaleString()}</p>
                                        </div>
                                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                            item.status === 'queued'
                                                ? 'bg-blue-100 text-blue-700'
                                                : item.status === 'needs_reason'
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : item.status === 'failed'
                                                        ? 'bg-red-100 text-red-700'
                                                        : item.status === 'expired'
                                                            ? 'bg-gray-200 text-gray-700'
                                                            : 'bg-gray-100 text-gray-700'
                                        }`}>
                                            {item.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                    {item.status === 'expired' && (
                                        <p className="text-xs text-red-600 mt-2">Expired (older than 48 hours). Please re-scan.</p>
                                    )}
                                    {item.lastError && (
                                        <p className="text-xs text-red-600 mt-2">{item.lastError}</p>
                                    )}

                                    {item.status === 'needs_reason' && (
                                        <div className="mt-3 space-y-2">
                                            <textarea
                                                className="input w-full min-h-[70px]"
                                                placeholder="Override reason (required)"
                                                value={queueReason[item.id] || ''}
                                                onChange={(e) => setQueueReason((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                            />
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                disabled={!queueReason[item.id]?.trim()}
                                                onClick={() => {
                                                    const reason = queueReason[item.id]?.trim() || '';
                                                    const updated = updateScanInQueue(item.id, { overrideReason: reason, status: 'queued', lastError: null });
                                                    setQueue(updated);
                                                    syncQueue();
                                                }}
                                            >
                                                Submit reason & sync
                                            </button>
                                        </div>
                                    )}

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {item.status !== 'expired' && (
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => {
                                                    const updated = updateScanInQueue(item.id, { status: 'queued', lastError: null, attempts: 0 });
                                                    setQueue(updated);
                                                    syncQueue(false);
                                                }}
                                            >
                                                Retry
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => setQueue(removeScanFromQueue(item.id))}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {filteredQueue.length === 0 && (
                                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                                    No items match the selected filter.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {scanResult && (
                    <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <QrCode className="w-5 h-5 text-primary" />
                                    <h2 className="text-lg font-semibold text-gray-900">{scanResult.reservation_code}</h2>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">{scanResult.guest_name || 'Guest'}</p>
                            </div>
                            {scanResult.reservation_id && (
                                <Link
                                    to={`/admin/reservations/${scanResult.reservation_id}`}
                                    className="text-sm font-semibold text-primary hover:underline"
                                >
                                    View Reservation
                                </Link>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500">Check-in</p>
                                <p className="font-medium text-gray-900">{scanResult.check_in_date ? formatDateWithWeekday(scanResult.check_in_date) : '—'}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500">Check-out</p>
                                <p className="font-medium text-gray-900">{scanResult.check_out_date ? formatDateWithWeekday(scanResult.check_out_date) : '—'}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500">Status</p>
                                <p className="font-medium text-gray-900">{scanResult.status?.replace(/_/g, ' ') || '—'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500">Total</p>
                                <p className="font-medium text-gray-900">{formatPeso(scanResult.total_amount || 0)}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500">Paid (Verified)</p>
                                <p className="font-medium text-gray-900">{formatPeso(scanResult.amount_paid_verified || 0)}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500">Balance Due</p>
                                <p className={`font-medium ${(scanResult.balance_due || 0) === 0 ? 'text-green-700' : 'text-orange-700'}`}>
                                    {formatPeso(scanResult.balance_due || 0)}
                                </p>
                            </div>
                        </div>

                        {scanResult.allowed ? (
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                                <span className="text-green-700 font-medium">Ready for check-in.</span>
                                <button
                                    className="btn-primary"
                                    onClick={handleCheckin}
                                    disabled={performCheckin.isPending}
                                >
                                    {performCheckin.isPending ? 'Checking in...' : 'Check-in Now'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                                    {scanResult.reason || 'Check-in is not allowed.'}
                                </div>

                                {scanResult.can_override && (
                                    <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
                                        <p className="text-sm font-semibold text-red-700">Force Check-in (Admin Override)</p>
                                        <p className="text-xs text-red-700">
                                            This will allow unpaid check-in and will be logged. Reason is required.
                                        </p>
                                        <textarea
                                            className="input w-full min-h-[90px]"
                                            placeholder="Reason for override (required)"
                                            value={overrideReason}
                                            onChange={(e) => setOverrideReason(e.target.value)}
                                        />
                                        <button
                                            className="btn-primary"
                                            onClick={handleCheckin}
                                            disabled={performCheckin.isPending || !overrideReason.trim()}
                                        >
                                            {performCheckin.isPending ? 'Recording...' : 'Force Check-in'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setScanResult(null);
                                    setScanSuccess(null);
                                    setScanError(null);
                                    setOverrideReason('');
                                    setIsScanning(true);
                                }}
                            >
                                Scan Again
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={resetScan}
                            >
                                Clear Result
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
