import { useState } from 'react';
import { Calendar, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { GuestLayout } from '../components/layout/GuestLayout';
import { useMyReservations, type ReservationWithUnits, useCancelReservation } from '../features/reservations/useReservations';
import { useSubmitPaymentProof } from '../features/payments/usePayments';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const STATUS_STYLES = {
    pending_payment: 'bg-yellow-100 text-yellow-800',
    for_verification: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-green-100 text-green-800',
    checked_in: 'bg-indigo-100 text-indigo-800',
    checked_out: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
    no_show: 'bg-red-100 text-red-800',
};

export function MyBookingsPage() {
    const { data: reservations, isLoading, error } = useMyReservations();
    const { user } = useAuth();
    const submitPayment = useSubmitPaymentProof();
    const cancelReservation = useCancelReservation();
    const gcashNumber = import.meta.env.VITE_GCASH_NUMBER as string | undefined;
    const gcashName = import.meta.env.VITE_GCASH_NAME as string | undefined;
    const [paymentDrafts, setPaymentDrafts] = useState<Record<string, {
        paymentType: 'deposit' | 'full';
        referenceNo: string;
    }>>({});
    const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});
    const [paymentFiles, setPaymentFiles] = useState<Record<string, File | null>>({});
    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [filter, setFilter] = useState<'all' | 'stays' | 'tours'>('all');

    const filteredReservations = reservations?.filter((r) => {
        const hasUnits = (r.units?.length || 0) > 0;
        const hasTours = (r.service_bookings?.length || 0) > 0;
        if (filter === 'stays') return hasUnits;
        if (filter === 'tours') return hasTours;
        return true;
    });

    return (
        <GuestLayout>
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">My Bookings</h1>
                    <p className="text-gray-600 mt-1">View and manage your reservations</p>
                    <div className="mt-4 flex items-center gap-2">
                        <label className="text-sm text-gray-600">Filter:</label>
                        <select
                            className="input w-40"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value as 'all' | 'stays' | 'tours')}
                        >
                            <option value="all">All</option>
                            <option value="stays">Rooms/Cottages</option>
                            <option value="tours">Tours</option>
                        </select>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                        <p className="text-sm text-red-800">Failed to load bookings. Please try again.</p>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && filteredReservations?.length === 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                        <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No bookings yet</h3>
                        <p className="text-gray-600 mb-6">Start planning your stay at Hillside Resort!</p>
                        <a href="/book" className="btn-primary inline-flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            Book Now
                        </a>
                    </div>
                )}

                {/* Reservations List */}
                {!isLoading && !error && filteredReservations && filteredReservations.length > 0 && (
                    <div className="space-y-4">
                        {filteredReservations.map((reservation: ReservationWithUnits) => {
                            const requiresFullPayment =
                                (reservation.deposit_required || 0) >= reservation.total_amount
                                && reservation.total_amount > 0;
                            const defaultPaymentType: 'deposit' | 'full' =
                                requiresFullPayment ? 'full' : ((reservation.deposit_required || 0) > 0 ? 'deposit' : 'full');
                            const draft = paymentDrafts[reservation.reservation_id] || {
                                paymentType: defaultPaymentType,
                                referenceNo: '',
                            };
                            const amount = draft.paymentType === 'deposit'
                                ? (reservation.deposit_required || 0)
                                : reservation.total_amount;

                            return (
                            <div key={reservation.reservation_id} className="bg-white rounded-xl shadow-sm p-6">
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold text-gray-900">
                                                {reservation.reservation_code}
                                            </h3>
                                            <span
                                                className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[reservation.status as keyof typeof STATUS_STYLES] || 'bg-gray-100 text-gray-800'
                                                    }`}
                                            >
                                                {reservation.status.replace(/_/g, ' ').toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            Booked on {new Date(reservation.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-primary">
                                            ₱{reservation.total_amount.toLocaleString()}
                                        </p>
                                        <p className="text-sm text-gray-500">Total</p>
                                        {['pending_payment', 'for_verification', 'confirmed'].includes(reservation.status) && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="mt-3 inline-flex items-center px-3 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                                    onClick={async () => {
                                                        if (!window.confirm('Cancel this booking? This action cannot be undone.')) return;
                                                        try {
                                                            await cancelReservation.mutateAsync(reservation.reservation_id);
                                                        } catch (err) {
                                                            setPaymentErrors(prev => ({
                                                                ...prev,
                                                                [reservation.reservation_id]: err instanceof Error ? err.message : 'Failed to cancel booking.',
                                                            }));
                                                        }
                                                    }}
                                                    disabled={cancelReservation.isPending}
                                                >
                                                    {cancelReservation.isPending ? 'Cancelling...' : 'Cancel Booking'}
                                                </button>
                                                <p className="text-xs text-gray-500 mt-1">Available before check-in</p>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-5 h-5 text-gray-400" />
                                        <div>
                                            <p className="text-xs text-gray-500">Check-in</p>
                                            <p className="font-medium text-gray-900">
                                                {new Date(reservation.check_in_date).toLocaleDateString('en-US', {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-5 h-5 text-gray-400" />
                                        <div>
                                            <p className="text-xs text-gray-500">Check-out</p>
                                            <p className="font-medium text-gray-900">
                                                {new Date(reservation.check_out_date).toLocaleDateString('en-US', {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment Info */}
                                {reservation.status === 'pending_payment' && reservation.hold_expires_at && (
                                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2 mb-4">
                                        <Clock className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-yellow-800">Payment Required</p>
                                            <p className="text-xs text-yellow-700 mt-1">
                                                Complete payment before{' '}
                                                {new Date(reservation.hold_expires_at).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {reservation.status === 'for_verification' && (
                                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 mb-4">
                                        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-blue-800">Payment Verification in Progress</p>
                                            <p className="text-xs text-blue-700 mt-1">
                                                Our team is verifying your payment proof. This typically takes 24-48 hours.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Deposit Info */}
                                <div className="border-t border-gray-200 pt-4">
                                    <div className="flex justify-between items-center text-sm mb-2">
                                        <span className="text-gray-600">Deposit Required</span>
                                        <span className="font-medium">₱{(reservation.deposit_required || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-600">Amount Paid</span>
                                        <span className={`font-medium ${(reservation.amount_paid_verified || 0) >= (reservation.deposit_required || 0)
                                                ? 'text-green-600'
                                                : 'text-orange-600'
                                            }`}>
                                            ₱{(reservation.amount_paid_verified || 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                {/* Tour Details */}
                                {reservation.service_bookings && reservation.service_bookings.length > 0 && (
                                    <div className="border-t border-gray-200 pt-4 mt-4">
                                        <p className="text-sm font-semibold text-gray-900 mb-2">Tour Details</p>
                                        <div className="space-y-2">
                                            {reservation.service_bookings.map((sb) => (
                                                <div key={sb.service_booking_id} className="p-3 bg-blue-50 rounded-lg text-sm">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-blue-900">
                                                            {sb.service?.service_name || 'Tour'}
                                                        </span>
                                                        <span className="text-blue-900">
                                                            ₱{sb.total_amount.toLocaleString()}
                                                        </span>
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

                                {/* Submit Payment Proof */}
                                {reservation.status === 'pending_payment' && (
                                    <div className="border-t border-gray-200 pt-4 mt-4">
                                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Submit Payment Proof (GCash)</h4>

                                        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="font-semibold">Payment Details</p>
                                                <span className="text-xs text-blue-700">Send exact amount</span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="bg-white/70 rounded-md p-2">
                                                    <p className="text-xs text-blue-700">GCash No.</p>
                                                    <p className="font-semibold">{gcashNumber || 'Set VITE_GCASH_NUMBER'}</p>
                                                </div>
                                                <div className="bg-white/70 rounded-md p-2">
                                                    <p className="text-xs text-blue-700">Account Name</p>
                                                    <p className="font-semibold">{gcashName || 'Set VITE_GCASH_NAME'}</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 bg-blue-100/70 rounded-md p-2">
                                                <p className="text-xs text-blue-700">Amount to send</p>
                                                <p className="font-semibold">₱{amount.toLocaleString()} ({draft.paymentType})</p>
                                            </div>
                                            {(reservation.service_bookings?.length || 0) > 0 && (reservation.units?.length || 0) === 0 && (
                                                <p className="mt-2 text-xs text-blue-700">
                                                    {reservation.total_amount <= 500
                                                        ? 'Pay full online if total <= PHP 500'
                                                        : 'Pay PHP 500 online, balance on-site'}
                                                </p>
                                            )}
                                        </div>

                                        {paymentErrors[reservation.reservation_id] && (
                                            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                                {paymentErrors[reservation.reservation_id]}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Type</label>
                                                <select
                                                    className="input w-full"
                                                    value={draft.paymentType}
                                                    onChange={(e) => {
                                                        const paymentType = e.target.value as 'deposit' | 'full';
                                                        setPaymentDrafts(prev => ({
                                                            ...prev,
                                                            [reservation.reservation_id]: {
                                                                ...draft,
                                                                paymentType,
                                                            },
                                                        }));
                                                    }}
                                                    disabled={(reservation.deposit_required || 0) <= 0 || requiresFullPayment}
                                                >
                                                    {!requiresFullPayment && (reservation.deposit_required || 0) > 0 && (
                                                        <option value="deposit">Deposit</option>
                                                    )}
                                                    <option value="full">Full Payment</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                                                <input
                                                    className="input w-full"
                                                    type="text"
                                                    value={`₱${amount.toLocaleString()}`}
                                                    readOnly
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Reference No.</label>
                                                <input
                                                    className="input w-full"
                                                    type="text"
                                                    value={draft.referenceNo}
                                                    onChange={(e) => {
                                                        setPaymentDrafts(prev => ({
                                                            ...prev,
                                                            [reservation.reservation_id]: {
                                                                ...draft,
                                                                referenceNo: e.target.value,
                                                            },
                                                        }));
                                                    }}
                                                    placeholder="GCash reference number"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Proof of Payment (Image/PDF)</label>
                                                <input
                                                    className="input w-full"
                                                    type="file"
                                                    accept="image/*,application/pdf"
                                                    onChange={(e) => {
                                                        const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                                                        setPaymentFiles(prev => ({
                                                            ...prev,
                                                            [reservation.reservation_id]: file,
                                                        }));
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={submitPayment.isPending || uploading[reservation.reservation_id]}
                                            className="btn-primary mt-3"
                                            onClick={async () => {
                                                setPaymentErrors(prev => ({ ...prev, [reservation.reservation_id]: '' }));
                                                if (!user) {
                                                    setPaymentErrors(prev => ({ ...prev, [reservation.reservation_id]: 'You must be logged in.' }));
                                                    return;
                                                }
                                                if (!draft.referenceNo.trim()) {
                                                    setPaymentErrors(prev => ({ ...prev, [reservation.reservation_id]: 'Reference number is required.' }));
                                                    return;
                                                }
                                                const file = paymentFiles[reservation.reservation_id];
                                                if (!file) {
                                                    setPaymentErrors(prev => ({ ...prev, [reservation.reservation_id]: 'Please upload proof of payment.' }));
                                                    return;
                                                }
                                                if (file.size > 5 * 1024 * 1024) {
                                                    setPaymentErrors(prev => ({ ...prev, [reservation.reservation_id]: 'File must be 5MB or smaller.' }));
                                                    return;
                                                }
                                                try {
                                                    setUploading(prev => ({ ...prev, [reservation.reservation_id]: true }));
                                                    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                                                    const path = `payments/${user.id}/${reservation.reservation_id}/${crypto.randomUUID()}-${safeName}`;
                                                    const { error: uploadError } = await supabase
                                                        .storage
                                                        .from('payment-proofs')
                                                        .upload(path, file, { upsert: false });

                                                    if (uploadError) {
                                                        throw uploadError;
                                                    }

                                                    await submitPayment.mutateAsync({
                                                        reservationId: reservation.reservation_id,
                                                        paymentType: draft.paymentType,
                                                        amount,
                                                        method: 'gcash',
                                                        referenceNo: draft.referenceNo.trim(),
                                                        proofUrl: path,
                                                    });

                                                    setPaymentFiles(prev => ({ ...prev, [reservation.reservation_id]: null }));
                                                } catch (err) {
                                                    setPaymentErrors(prev => ({
                                                        ...prev,
                                                        [reservation.reservation_id]: err instanceof Error ? err.message : 'Payment submission failed.',
                                                    }));
                                                } finally {
                                                    setUploading(prev => ({ ...prev, [reservation.reservation_id]: false }));
                                                }
                                            }}
                                        >
                                            {submitPayment.isPending || uploading[reservation.reservation_id] ? 'Submitting...' : 'Submit Payment Proof'}
                                        </button>
                                    </div>
                                )}

                                {/* Notes */}
                                {reservation.notes && (
                                    <div className="border-t border-gray-200 pt-4 mt-4">
                                        <p className="text-sm text-gray-500">
                                            <strong>Notes:</strong> {reservation.notes}
                                        </p>
                                    </div>
                                )}
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </GuestLayout>
    );
}



