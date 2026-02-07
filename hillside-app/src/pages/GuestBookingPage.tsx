import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar,
    CheckCircle,
    AlertCircle,
    Loader2,
    X,
    Plus,
} from 'lucide-react';
import { GuestLayout } from '../components/layout/GuestLayout';
import { useAvailableUnits, useCreateReservation } from '../features/reservations/useReservations';
import { useAuth } from '../hooks/useAuth';
import type { Unit } from '../types/database';

interface SelectedUnit {
    unit: Unit;
    nights: number;
}

export function GuestBookingPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const createReservation = useCreateReservation();

    const [checkInDate, setCheckInDate] = useState(
        new Date(Date.now() + 86400000).toISOString().split('T')[0] // Tomorrow
    );
    const [checkOutDate, setCheckOutDate] = useState(
        new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0] // +3 days
    );
    const [selectedUnits, setSelectedUnits] = useState<SelectedUnit[]>([]);
    const [notes, setNotes] = useState('');
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get available units
    const { data: availableUnits, isLoading: loadingUnits } = useAvailableUnits(
        checkInDate,
        checkOutDate
    );

    // Calculate nights
    function calculateNights(start: string, end: string): number {
        const startDate = new Date(start);
        const endDate = new Date(end);
        return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    }

    const nights = calculateNights(checkInDate, checkOutDate);

    // Calculate total
    const total = selectedUnits.reduce((sum, su) => sum + (su.unit.base_price * nights), 0);

    // Add/remove units
    function addUnit(unit: Unit) {
        if (!selectedUnits.find(su => su.unit.unit_id === unit.unit_id)) {
            setSelectedUnits([...selectedUnits, { unit, nights }]);
        }
    }

    function removeUnit(unitId: string) {
        setSelectedUnits(selectedUnits.filter(su => su.unit.unit_id !== unitId));
    }

    function isUnitSelected(unitId: string): boolean {
        return selectedUnits.some(su => su.unit.unit_id === unitId);
    }

    // Submit
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (selectedUnits.length === 0) {
            setError('Please select at least one unit');
            return;
        }

        if (!user) {
            setError('You must be logged in');
            return;
        }

        try {
            setError(null);

            await createReservation.mutateAsync({
                guestUserId: user.id,
                checkInDate,
                checkOutDate,
                units: selectedUnits.map(su => ({
                    unitId: su.unit.unit_id,
                    rateSnapshot: su.unit.base_price,
                    nights,
                })),
                totalAmount: total,
                depositRequired: total * 0.5,
                notes: notes || undefined,
            });

            setSuccess(true);
            setTimeout(() => navigate('/my-bookings'), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create reservation');
        }
    }

    return (
        <GuestLayout>
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Book Your Stay</h1>
                    <p className="text-gray-600 mt-1">Select your dates and units to create a reservation</p>
                </div>

                {/* Success Alert */}
                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-green-800">Reservation created successfully!</p>
                            <p className="text-sm text-green-700 mt-1">Redirecting to your bookings...</p>
                        </div>
                    </div>
                )}

                {/* Error Alert */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                        <p className="text-sm text-red-800">{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Dates */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-primary" />
                                Select Dates
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Check-in Date
                                    </label>
                                    <input
                                        type="date"
                                        value={checkInDate}
                                        onChange={(e) => setCheckInDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]}
                                        className="input w-full"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Check-out Date
                                    </label>
                                    <input
                                        type="date"
                                        value={checkOutDate}
                                        onChange={(e) => setCheckOutDate(e.target.value)}
                                        min={checkInDate}
                                        className="input w-full"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                                <p className="text-sm text-blue-800">
                                    <strong>{nights}</strong> night{nights !== 1 ? 's' : ''} stay
                                </p>
                            </div>
                        </div>

                        {/* Available Units */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">
                                Available Units
                            </h2>

                            {loadingUnits ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                </div>
                            ) : availableUnits?.length === 0 ? (
                                <p className="text-gray-500 py-8 text-center">
                                    No units available for the selected dates
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {availableUnits?.map((unit) => (
                                        <div
                                            key={unit.unit_id}
                                            className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${isUnitSelected(unit.unit_id)
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                            onClick={() => isUnitSelected(unit.unit_id) ? removeUnit(unit.unit_id) : addUnit(unit)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className="font-medium text-gray-900">{unit.name}</h3>
                                                    <p className="text-sm text-gray-500 capitalize">
                                                        {unit.type} • Up to {unit.capacity} guests
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold text-gray-900">₱{unit.base_price.toLocaleString()}</p>
                                                    <p className="text-xs text-gray-500">per night</p>
                                                </div>
                                            </div>
                                            {isUnitSelected(unit.unit_id) && (
                                                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                                                    <span className="text-sm text-primary font-medium flex items-center gap-1">
                                                        <CheckCircle className="w-4 h-4" />
                                                        Selected
                                                    </span>
                                                    <span className="text-sm text-gray-600">
                                                        ₱{(unit.base_price * nights).toLocaleString()} for {nights} night{nights !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Special Requests (Optional)
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                className="input w-full"
                                placeholder="Any special requests or notes..."
                                maxLength={500}
                            />
                            <p className="text-xs text-gray-500 mt-1">{notes.length}/500 characters</p>
                        </div>
                    </div>

                    {/* Right Column - Summary */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Booking Summary</h2>

                            {selectedUnits.length === 0 ? (
                                <p className="text-gray-500 text-sm py-4 text-center">
                                    Select units to see summary
                                </p>
                            ) : (
                                <div className="space-y-3 mb-4">
                                    {selectedUnits.map((su) => (
                                        <div key={su.unit.unit_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div>
                                                <p className="font-medium text-gray-900 text-sm">{su.unit.name}</p>
                                                <p className="text-xs text-gray-500">{nights} night{nights !== 1 ? 's' : ''}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">₱{(su.unit.base_price * nights).toLocaleString()}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeUnit(su.unit.unit_id)}
                                                    className="p-1 text-gray-400 hover:text-red-500"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="border-t border-gray-200 pt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-gray-600">Subtotal</span>
                                    <span className="font-medium">₱{total.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-gray-600">Required Deposit (50%)</span>
                                    <span className="font-medium text-orange-600">₱{(total * 0.5).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-t border-gray-200">
                                    <span className="text-lg font-semibold text-gray-900">Total</span>
                                    <span className="text-xl font-bold text-primary">₱{total.toLocaleString()}</span>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={createReservation.isPending || success || selectedUnits.length === 0}
                                className="w-full btn-primary mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {createReservation.isPending ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-5 h-5" />
                                        Confirm Booking
                                    </>
                                )}
                            </button>

                            <p className="text-xs text-gray-500 mt-3 text-center">
                                You'll have 24 hours to complete payment after booking
                            </p>
                        </div>
                    </div>
                </form>
            </div>
        </GuestLayout>
    );
}
