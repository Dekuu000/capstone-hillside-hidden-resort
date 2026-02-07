import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import { useReservation } from '../features/reservations/useReservations';
import { usePaymentsByReservation, useRecordOnSitePayment } from '../features/payments/usePayments';

export function ReservationDetailsPage() {
    const { reservationId } = useParams();
    const { data: reservation, isLoading, error } = useReservation(reservationId);
    const { data: payments } = usePaymentsByReservation(reservationId);
    const recordOnSite = useRecordOnSitePayment();

    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<'cash' | 'gcash' | 'bank' | 'card'>('cash');
    const [referenceNo, setReferenceNo] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

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

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{reservation.reservation_code}</h1>
                            <p className="text-gray-600 mt-1">
                                {reservation.guest?.name || 'Guest'} • {reservation.guest?.email || ''}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold text-primary">₱{reservation.total_amount.toLocaleString()}</p>
                            <p className="text-sm text-gray-500">Total</p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Check-in</p>
                            <p className="font-medium text-gray-900">{reservation.check_in_date}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Check-out</p>
                            <p className="font-medium text-gray-900">{reservation.check_out_date}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Status</p>
                            <p className="font-medium text-gray-900">{reservation.status.replace(/_/g, ' ')}</p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Deposit Required</p>
                            <p className="font-medium text-gray-900">₱{(reservation.deposit_required || 0).toLocaleString()}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Amount Paid</p>
                            <p className="font-medium text-gray-900">₱{(reservation.amount_paid_verified || 0).toLocaleString()}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">Balance Due</p>
                            <p className="font-medium text-gray-900">₱{balanceDue.toLocaleString()}</p>
                        </div>
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
                                        <span className="text-blue-900">₱{sb.total_amount.toLocaleString()}</span>
                                    </div>
                                    <div className="text-blue-800 mt-1">
                                        Date: {new Date(sb.visit_date).toLocaleDateString()}
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
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">Payment History</h2>
                    {payments && payments.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Date</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Type</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Method</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Amount</th>
                                        <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {payments.map((p) => (
                                        <tr key={p.payment_id}>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {new Date(p.created_at).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">{p.payment_type.replace('_', ' ')}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700">{p.method}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700">₱{p.amount.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-sm text-gray-700">{p.status}</td>
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
