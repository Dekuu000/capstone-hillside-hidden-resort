import { Calendar, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { GuestLayout } from '../components/layout/GuestLayout';
import { useMyReservations, type ReservationWithUnits } from '../features/reservations/useReservations';

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

    return (
        <GuestLayout>
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">My Bookings</h1>
                    <p className="text-gray-600 mt-1">View and manage your reservations</p>
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
                {!isLoading && !error && reservations?.length === 0 && (
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
                {!isLoading && !error && reservations && reservations.length > 0 && (
                    <div className="space-y-4">
                        {reservations.map((reservation: ReservationWithUnits) => (
                            <div key={reservation.reservation_id} className="bg-white rounded-xl shadow-sm p-6">
                                <div className="flex items-start justify-between mb-4">
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
                                        <span className="text-gray-600">Deposit Required (50%)</span>
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

                                {/* Notes */}
                                {reservation.notes && (
                                    <div className="border-t border-gray-200 pt-4 mt-4">
                                        <p className="text-sm text-gray-500">
                                            <strong>Notes:</strong> {reservation.notes}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </GuestLayout>
    );
}
