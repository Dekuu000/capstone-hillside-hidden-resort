import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Calendar,
    Plus,
    Search,
    Filter,
    Eye,
    Clock,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
    DoorOpen,
    DoorClosed,
} from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import { StatusBadge } from '../components/badges/StatusBadge';
import { useReservations, useUpdateReservationStatus, useCancelReservation } from '../features/reservations/useReservations';
import type { Reservation } from '../types/database';
import { formatDate, formatPeso } from '../lib/formatting';
import { calculateNights } from '../lib/validation';

const STATUS_CONFIG: Record<Reservation['status'], { label: string; color: string; icon: typeof Clock }> = {
    pending_payment: { label: 'Pending Payment', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    for_verification: { label: 'For Verification', color: 'bg-orange-100 text-orange-800', icon: AlertTriangle },
    confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
    checked_in: { label: 'Checked In', color: 'bg-blue-100 text-blue-800', icon: DoorOpen },
    checked_out: { label: 'Checked Out', color: 'bg-gray-100 text-gray-800', icon: DoorClosed },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: XCircle },
    no_show: { label: 'No Show', color: 'bg-gray-100 text-gray-600', icon: XCircle },
};

export function ReservationsPage() {
    const [statusFilter, setStatusFilter] = useState<Reservation['status'] | ''>('');
    const [searchQuery, setSearchQuery] = useState('');

    const { data: reservations, isLoading, error } = useReservations(statusFilter || undefined);
    const updateStatus = useUpdateReservationStatus();
    const cancelReservation = useCancelReservation();

    // Filter reservations by search query
    const filteredReservations = reservations?.filter((res) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            res.reservation_code.toLowerCase().includes(query) ||
            res.guest?.name?.toLowerCase().includes(query) ||
            res.guest?.email?.toLowerCase().includes(query)
        );
    });

    async function handleStatusChange(reservationId: string, newStatus: Reservation['status']) {
        try {
            await updateStatus.mutateAsync({ reservationId, status: newStatus });
        } catch {
            // Intentionally silent; UI already reflects failure via query state
        }
    }

    async function handleCancel(reservationId: string) {
        if (window.confirm('Are you sure you want to cancel this reservation?')) {
            try {
                await cancelReservation.mutateAsync(reservationId);
            } catch {
                // Intentionally silent; UI already reflects failure via query state
            }
        }
    }

    if (error) {
        return (
            <AdminLayout>
                <div className="text-center py-12">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900">Error Loading Reservations</h2>
                    <p className="text-gray-600 mt-2">{(error as Error).message}</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Reservations</h1>
                        <p className="text-gray-600">Manage guest bookings and check-ins</p>
                    </div>
                    <Link
                        to="/admin/reservations/new"
                        className="btn-primary inline-flex items-center gap-2 w-fit"
                    >
                        <Plus className="w-5 h-5" />
                        Walk-in Booking
                    </Link>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by code, guest name, or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="input-field pl-10"
                            />
                        </div>

                        {/* Status Filter */}
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as Reservation['status'] | '')}
                                className="input-field pl-10 pr-8 appearance-none min-w-48"
                            >
                                <option value="">All Statuses</option>
                                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                                    <option key={status} value={status}>
                                        {config.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Reservations Table */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : filteredReservations?.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                        <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Reservations Found</h3>
                        <p className="text-gray-500 mb-6">
                            {searchQuery || statusFilter
                                ? 'Try adjusting your filters'
                                : 'Create a walk-in booking to get started'}
                        </p>
                        <Link to="/admin/reservations/new" className="btn-primary inline-flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            New Booking
                        </Link>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Code</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Guest</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Dates</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Units</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Total</th>
                                        <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Status</th>
                                        <th className="text-right px-6 py-4 text-sm font-semibold text-gray-900">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredReservations?.map((reservation) => {
                                        const statusConfig = STATUS_CONFIG[reservation.status];
                                        const StatusIcon = statusConfig.icon;
                                        const nights = calculateNights(reservation.check_in_date, reservation.check_out_date);
                                        const remainingBalance = reservation.balance_due ?? Math.max(0, (reservation.total_amount || 0) - (reservation.amount_paid_verified || 0));

                                        return (
                                            <tr key={reservation.reservation_id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4">
                                                    <span className="font-mono text-sm font-medium text-primary">
                                                        {reservation.reservation_code}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div>
                                                        <p className="font-medium text-gray-900">
                                                            {reservation.guest?.name || reservation.guest?.email || 'Unknown'}
                                                        </p>
                                                        {reservation.guest?.email && reservation.guest?.email !== reservation.guest?.name && (
                                                            <p className="text-sm text-gray-500">{reservation.guest?.email}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm">
                                                        <p className="text-gray-900">
                                                            {formatDate(reservation.check_in_date)} - {formatDate(reservation.check_out_date)}
                                                        </p>
                                                        <p className="text-gray-500">{nights} night{nights !== 1 ? 's' : ''}</p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm">
                                                        {reservation.units?.slice(0, 2).map((ru) => (
                                                            <span
                                                                key={ru.reservation_unit_id}
                                                                className="inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs mr-1 mb-1"
                                                            >
                                                                {ru.unit?.name || 'Unit'}
                                                            </span>
                                                        ))}
                                                        {reservation.service_bookings?.slice(0, 1).map((sb) => (
                                                            <span
                                                                key={sb.service_booking_id}
                                                                className="inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs mr-1 mb-1"
                                                            >
                                                                {sb.service?.service_name || 'Tour'}
                                                            </span>
                                                        ))}
                                                        {(reservation.units?.length || 0) > 2 && (
                                                            <span className="text-gray-500 text-xs">
                                                                +{(reservation.units?.length || 0) - 2} more
                                                            </span>
                                                        )}
                                                        {!reservation.units?.length && !reservation.service_bookings?.length && (
                                                            <span className="text-gray-400 text-xs">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div>
                                                        <p className="font-semibold text-gray-900">
                                                            {formatPeso(reservation.total_amount)}
                                                        </p>
                                                        {remainingBalance > 0 ? (
                                                            <p className="text-xs text-orange-600">
                                                                Remaining (on-site): {formatPeso(remainingBalance)}
                                                            </p>
                                                        ) : (
                                                            <p className="text-xs text-green-600">Paid in full</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <StatusBadge
                                                        label={statusConfig.label}
                                                        className={statusConfig.color}
                                                        icon={StatusIcon}
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Link
                                                            to={`/admin/reservations/${reservation.reservation_id}`}
                                                            className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                                                            title="View Details"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </Link>

                                                        {/* Quick Actions */}
                                                        {reservation.status === 'for_verification' && (
                                                            <Link
                                                                to="/admin/payments"
                                                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                                title="Review Payments"
                                                            >
                                                                <CheckCircle className="w-4 h-4" />
                                                            </Link>
                                                        )}

                                                        {reservation.status === 'confirmed' && (
                                                            <button
                                                                onClick={() => handleStatusChange(reservation.reservation_id, 'checked_in')}
                                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                title="Check In"
                                                            >
                                                                <DoorOpen className="w-4 h-4" />
                                                            </button>
                                                        )}

                                                        {reservation.status === 'checked_in' && (
                                                            <button
                                                                onClick={() => handleStatusChange(reservation.reservation_id, 'checked_out')}
                                                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                                                title="Check Out"
                                                            >
                                                                <DoorClosed className="w-4 h-4" />
                                                            </button>
                                                        )}

                                                        {['pending_payment', 'for_verification', 'confirmed'].includes(reservation.status) && (
                                                            <button
                                                                onClick={() => handleCancel(reservation.reservation_id)}
                                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Cancel Reservation"
                                                            >
                                                                <XCircle className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Stats Summary */}
                {reservations && reservations.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {(['pending_payment', 'for_verification', 'confirmed', 'checked_in'] as const).map((status) => {
                            const count = reservations.filter((r) => r.status === status).length;
                            const config = STATUS_CONFIG[status];
                            const Icon = config.icon;
                            return (
                                <div
                                    key={status}
                                    className="bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
                                    onClick={() => setStatusFilter(status)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${config.color}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-gray-900">{count}</p>
                                            <p className="text-sm text-gray-600">{config.label}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}


