import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, Loader2, CheckCircle, ExternalLink, XCircle, CreditCard, QrCode } from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import { useReservation, useValidateQrCheckin, usePerformCheckin, usePerformCheckout } from '../features/reservations/useReservations';
import { usePaymentsByReservation, useRecordOnSitePayment, useVerifyPayment } from '../features/payments/usePayments';
import { createPaymentProofSignedUrl } from '../services/storageService';
import { formatDateLocal, formatDateTimeLocal, formatDateWithWeekday } from '../lib/validation';
import { formatPeso } from '../lib/paymentUtils';

export function ReservationDetailsPage() {
    const { reservationId } = useParams();
    const { data: reservation, isLoading, error } = useReservation(reservationId);
    const { data: payments } = usePaymentsByReservation(reservationId);
    const recordOnSite = useRecordOnSitePayment();
    const verifyPayment = useVerifyPayment();
    const validateQr = useValidateQrCheckin();
    const performCheckin = usePerformCheckin();
    const performCheckout = usePerformCheckout();

    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<'cash' | 'gcash' | 'bank' | 'card'>('cash');
    const [referenceNo, setReferenceNo] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [checkinError, setCheckinError] = useState<string | null>(null);
    const [overrideReason, setOverrideReason] = useState('');
    const [proofLinks, setProofLinks] = useState<Record<string, string>>({});
    const [loadingProof, setLoadingProof] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (reservation?.reservation_code) {
            validateQr.mutate(reservation.reservation_code);
        }
    }, [reservation?.reservation_code]);

    async function openProof(paymentId: string, proofPath?: string | null) {
        if (!proofPath) return;
        if (proofLinks[paymentId]) {
            window.open(proofLinks[paymentId], '_blank', 'noopener,noreferrer');
            return;
        }

        try {
            setLoadingProof(prev => ({ ...prev, [paymentId]: true }));
            const signedUrl = await createPaymentProofSignedUrl(proofPath, 600);
            setProofLinks(prev => ({ ...prev, [paymentId]: signedUrl }));
            window.open(signedUrl, '_blank', 'noopener,noreferrer');
        } finally {
            setLoadingProof(prev => ({ ...prev, [paymentId]: false }));
        }
    }

    if (isLoading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            </AdminLayout>
        );
    }

    if (error || !reservation) {
        return (
            <AdminLayout>
                <div className="text-center py-12">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Reservation Not Found</h2>
                    <p className="text-gray-600 mt-2">{(error as Error)?.message || 'Please try again.'}</p>
                </div>
            </AdminLayout>
        );
    }

    const balanceDue = Math.max(0, (reservation.total_amount || 0) - (reservation.amount_paid_verified || 0));
    const checkinValidation = validateQr.data;

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{reservation.reservation_code}</h1>
                            <p className="text-gray-600 mt-1">
                                {reservation.guest?.name || reservation.guest?.email || 'Guest User'}
                                {reservation.guest?.email && reservation.guest?.email !== reservation.guest?.name
                                    ? ` • ${reservation.guest?.email}`
                                    : ''}
                            </p>
                        </div>
                        <div className="text-left sm:text-right">
                            <p className="text-2xl font-bold text-primary">{formatPeso(reservation.total_amount)}</p>
                            <p className="text-sm text-gray-500">Total</p>
                            <div className="mt-3 flex flex-col items-stretch sm:items-end gap-2 w-full">
                                <Link
                                    to="/admin/payments"
                                    className="btn-secondary w-full sm:w-auto justify-center inline-flex items-center gap-2 px-4 py-2 text-sm sm:px-6 sm:py-3"
                                >
                                    <CreditCard className="w-4 h-4" />
                                    View All Payments
                                </Link>
                                <Link
                                    to="/admin/scan"
                                    className="btn-primary w-full sm:w-auto justify-center inline-flex items-center gap-2 px-4 py-2 text-sm sm:px-6 sm:py-3"
                                >
                                    <QrCode className="w-4 h-4" />
                                    Scan QR
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Check-in</p>
                            <p className="font-medium text-gray-900">{formatDateWithWeekday(reservation.check_in_date)}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Check-out</p>
                            <p className="font-medium text-gray-900">{formatDateWithWeekday(reservation.check_out_date)}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Status</p>
                            <p className="font-medium text-gray-900">{reservation.status.replace(/_/g, ' ')}</p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Amount Paid (Verified)</p>
                            <p className="font-medium text-gray-900">{formatPeso(reservation.amount_paid_verified || 0)}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Remaining Balance (On-site)</p>
                            <p className={`font-medium ${balanceDue === 0 ? 'text-green-700' : 'text-orange-700'}`}>
                                {formatPeso(balanceDue)}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-1">
                                {balanceDue === 0 ? 'No balance due.' : 'Collect this on arrival.'}
                            </p>
                        </div>
                    </div>

                    {/* Check-in Actions */}
                    <div className="mt-5 border-t border-gray-200 pt-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Check-in Actions</p>
                                <p className="text-xs text-gray-500">
                                    Check-in is allowed only on the reservation date and after payment verification.
                                </p>
                            </div>
                            {reservation.status === 'checked_in' ? (
                                <button
                                    className="btn-secondary"
                                    onClick={async () => {
                                        setCheckinError(null);
                                        try {
                                            await performCheckout.mutateAsync(reservation.reservation_id);
                                            await validateQr.mutateAsync(reservation.reservation_code);
                                        } catch (err) {
                                            setCheckinError(err instanceof Error ? err.message : 'Failed to check out.');
                                        }
                                    }}
                                >
                                    {performCheckout.isPending ? 'Checking out...' : 'Check-out'}
                                </button>
                            ) : (
                                <div className="flex flex-col items-start md:items-end gap-2">
                                    <button
                                        className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                                        onClick={async () => {
                                            setCheckinError(null);
                                            try {
                                                await performCheckin.mutateAsync({
                                                    reservationId: reservation.reservation_id,
                                                    overrideReason: checkinValidation?.can_override ? overrideReason.trim() : null,
                                                });
                                                setOverrideReason('');
                                                await validateQr.mutateAsync(reservation.reservation_code);
                                            } catch (err) {
                                                setCheckinError(err instanceof Error ? err.message : 'Check-in failed.');
                                            }
                                        }}
                                        disabled={
                                            performCheckin.isPending ||
                                            (!checkinValidation?.allowed && !checkinValidation?.can_override) ||
                                            (checkinValidation?.can_override && !overrideReason.trim())
                                        }
                                    >
                                        {performCheckin.isPending
                                            ? 'Checking in...'
                                            : checkinValidation?.can_override
                                                ? 'Force Check-in'
                                                : 'Check-in'}
                                    </button>
                                    {!checkinValidation?.allowed && !checkinValidation?.can_override && reservation.check_in_date && (
                                        <p className="text-xs text-gray-500">
                                            Available on {formatDateWithWeekday(reservation.check_in_date)}.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {checkinValidation && !checkinValidation.allowed && (
                            <div className="mt-3 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                {checkinValidation.reason || 'Check-in is blocked by policy.'}
                            </div>
                        )}

                        {checkinValidation?.can_override && reservation.status !== 'checked_in' && (
                            <div className="mt-3">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Override Reason (required)</label>
                                <textarea
                                    className="input w-full min-h-[90px]"
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    placeholder="Reason for admin override"
                                />
                            </div>
                        )}

                        {checkinError && (
                            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                                {checkinError}
                            </div>
                        )}
                    </div>
                </div>

                {/* Units */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">Units</h2>
                    <div className="flex flex-wrap gap-2">
                        {reservation.units?.map((ru) => (
                            <span
                                key={ru.reservation_unit_id}
                                className="inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs"
                            >
                                {ru.unit?.name || 'Unit'}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Tours */}
                {reservation.service_bookings && reservation.service_bookings.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-3">Tours</h2>
                        <div className="space-y-2">
                            {reservation.service_bookings.map((sb) => (
                                <div key={sb.service_booking_id} className="p-3 bg-blue-50 rounded-lg text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-blue-900">
                                            {sb.service?.service_name || 'Tour'}
                                        </span>
                                        <span className="text-blue-900">{formatPeso(sb.total_amount)}</span>
                                    </div>
                                    <div className="text-blue-800 mt-1">
                                        Date: {formatDateLocal(sb.visit_date)}
                                        {' '}• Adults: {sb.adult_qty} • Kids: {sb.kid_qty}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Record On-site Payment */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">Record On-Site Payment</h2>
                    {formError && (
                        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            {formError}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                            <input
                                className="input w-full"
                                type="number"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder={balanceDue.toString()}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
                            <select
                                className="input w-full"
                                value={method}
                                onChange={(e) => setMethod(e.target.value as typeof method)}
                            >
                                <option value="cash">Cash</option>
                                <option value="gcash">GCash</option>
                                <option value="bank">Bank</option>
                                <option value="card">Card</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Reference No. (Optional)</label>
                            <input
                                className="input w-full"
                                type="text"
                                value={referenceNo}
                                onChange={(e) => setReferenceNo(e.target.value)}
                                placeholder="Receipt / reference"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={recordOnSite.isPending}
                        className="btn-primary mt-3"
                        onClick={async () => {
                            setFormError(null);
                            const numericAmount = Number(amount || balanceDue);
                            if (!numericAmount || numericAmount <= 0) {
                                setFormError('Amount must be greater than zero.');
                                return;
                            }
                            try {
                                await recordOnSite.mutateAsync({
                                    reservationId: reservation.reservation_id,
                                    amount: numericAmount,
                                    method,
                                    referenceNo: referenceNo.trim() || undefined,
                                });
                                setAmount('');
                                setReferenceNo('');
                            } catch (err) {
                                setFormError(err instanceof Error ? err.message : 'Failed to record payment.');
                            }
                        }}
                    >
                        {recordOnSite.isPending ? 'Recording...' : 'Record Payment'}
                    </button>
                    {recordOnSite.isSuccess && (
                        <div className="mt-3 flex items-center text-sm text-green-700">
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Payment recorded.
                        </div>
                    )}
                </div>

                {/* Payment History */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
                        {['pending_payment', 'for_verification'].includes(reservation.status) && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                                Pending Payment
                            </span>
                        )}
                    </div>
                    {payments && payments.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Date</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Type</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Method</th>
                                        {['pending_payment', 'for_verification'].includes(reservation.status) && (
                                            <>
                                                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Reference</th>
                                                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Proof</th>
                                            </>
                                        )}
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Amount</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Status</th>
                                        {['pending_payment', 'for_verification'].includes(reservation.status) && (
                                            <th className="text-right px-4 py-3 text-sm font-semibold text-gray-900">Actions</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {payments.map((p) => (
                                        <tr key={p.payment_id}>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {formatDateTimeLocal(p.created_at)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">{p.payment_type.replace('_', ' ')}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700">{p.method}</td>
                                            {['pending_payment', 'for_verification'].includes(reservation.status) && (
                                                <>
                                                    <td className="px-4 py-3 text-sm text-gray-700">{p.reference_no || '—'}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-700">
                                                        {p.proof_url ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openProof(p.payment_id, p.proof_url)}
                                                                className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                                                                disabled={loadingProof[p.payment_id]}
                                                            >
                                                                {loadingProof[p.payment_id] ? 'Loading...' : 'View'}
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-sm text-gray-400">—</span>
                                                        )}
                                                    </td>
                                                </>
                                            )}
                                            <td className="px-4 py-3 text-sm text-gray-700">{formatPeso(p.amount)}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700">{p.status}</td>
                                            {['pending_payment', 'for_verification'].includes(reservation.status) && (
                                                <td className="px-4 py-3 text-right">
                                                    {p.status === 'pending' ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => verifyPayment.mutateAsync({ paymentId: p.payment_id, approved: true })}
                                                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                                title="Verify Payment"
                                                            >
                                                                <CheckCircle className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => verifyPayment.mutateAsync({ paymentId: p.payment_id, approved: false })}
                                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Reject Payment"
                                                            >
                                                                <XCircle className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">—</span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">No payments recorded yet.</p>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}


