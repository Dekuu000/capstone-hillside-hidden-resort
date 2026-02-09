import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    ArrowLeft,
    Calendar,
    Search,
    Plus,
    Loader2,
    CheckCircle,
    AlertCircle,
    User,
    X,
} from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import { PaymentSummaryBreakdown } from '../components/payments/PaymentSummaryBreakdown';
import { PayNowSelector } from '../components/payments/PayNowSelector';
import { useAvailableUnits, useCreateReservation } from '../features/reservations/useReservations';
import { useAuth } from '../hooks/useAuth';
import type { Unit } from '../types/database';
import { formatPeso } from '../lib/formatting';
import { computeBalance, computePayNow, computeUnitDeposit } from '../lib/paymentUtils';
import { calculateNights } from '../lib/validation';

// Form schema
const reservationSchema = z.object({
    guestName: z.string().min(2, 'Name is required'),
    guestEmail: z.string().email('Invalid email').optional().or(z.literal('')),
    guestPhone: z.string().optional(),
    checkInDate: z.string().min(1, 'Check-in date is required'),
    checkOutDate: z.string().min(1, 'Check-out date is required'),
    notes: z.string().optional(),
});

type ReservationFormData = z.infer<typeof reservationSchema>;

interface SelectedUnit {
    unit: Unit;
    nights: number;
}

export function NewReservationPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const createReservation = useCreateReservation();

    const [selectedUnits, setSelectedUnits] = useState<SelectedUnit[]>([]);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<ReservationFormData>({
        resolver: zodResolver(reservationSchema),
        defaultValues: {
            guestName: '',
            guestEmail: '',
            guestPhone: '',
            checkInDate: new Date().toISOString().split('T')[0],
            checkOutDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            notes: '',
        },
    });

    const checkInDate = watch('checkInDate');
    const checkOutDate = watch('checkOutDate');

    // Get available units for selected dates
    const { data: availableUnits, isLoading: loadingUnits } = useAvailableUnits(
        checkInDate,
        checkOutDate
    );

    const nights = Math.max(1, calculateNights(checkInDate, checkOutDate));

    // Calculate total
    const total = selectedUnits.reduce((sum, su) => sum + (su.unit.base_price * nights), 0);

    const depositRequired = computeUnitDeposit(selectedUnits.map((su) => su.unit));
    const [payNow, setPayNow] = useState(0);
    const [payNowError, setPayNowError] = useState<string | null>(null);
    const [showCustomPayNow, setShowCustomPayNow] = useState(false);
    const canChoosePayNow = total > depositRequired;
    const balanceOnSite = computeBalance(total, payNow);

    useEffect(() => {
        if (total <= 0) {
            setPayNow(0);
            setPayNowError(null);
            setShowCustomPayNow(false);
            return;
        }
        const minPay = depositRequired;
        const maxPay = total;
        setPayNow((current) => {
            const base = current > 0 ? current : minPay;
            return computePayNow(minPay, maxPay, base);
        });
        setPayNowError(null);
        setShowCustomPayNow(false);
    }, [depositRequired, total]);

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
    async function onSubmit(data: ReservationFormData) {
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

            // For walk-in, we use the admin's user ID as guest (in production, you'd create a guest account)
            await createReservation.mutateAsync({
                guestUserId: user.id,
                checkInDate: data.checkInDate,
                checkOutDate: data.checkOutDate,
                units: selectedUnits.map(su => ({
                    unitId: su.unit.unit_id,
                    rateSnapshot: su.unit.base_price,
                    nights,
                })),
                totalAmount: total,
                depositRequired,
                expectedPayNow: payNow,
                notes: `Walk-in: ${data.guestName}${data.guestPhone ? ` | Phone: ${data.guestPhone}` : ''}${data.guestEmail ? ` | Email: ${data.guestEmail}` : ''}${data.notes ? ` | Notes: ${data.notes}` : ''}`,
            });

            setSuccess(true);
            setTimeout(() => navigate('/admin/reservations'), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create reservation');
        }
    }

    return (
        <AdminLayout>
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <button
                        onClick={() => navigate('/admin/reservations')}
                        className="flex items-center text-gray-600 hover:text-primary mb-4 cursor-pointer"
                    >
                        <ArrowLeft className="w-5 h-5 mr-2" />
                        Back to Reservations
                    </button>
                    <h1 className="text-3xl font-bold text-gray-900">New Walk-in Booking</h1>
                    <p className="text-gray-600 mt-1">Create a reservation for a walk-in guest</p>
                </div>

                {/* Success Alert */}
                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start" role="alert">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-green-800">Reservation created successfully!</p>
                            <p className="text-sm text-green-700 mt-1">Redirecting...</p>
                        </div>
                    </div>
                )}

                {/* Error Alert */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start" role="alert">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                        <p className="text-sm text-red-800">{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Guest Info & Dates */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Guest Information */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <User className="w-5 h-5 text-primary" />
                                Guest Information
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Guest Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        {...register('guestName')}
                                        type="text"
                                        className={`input w-full ${errors.guestName ? 'input-error' : ''}`}
                                        placeholder="Full name"
                                    />
                                    {errors.guestName && (
                                        <p className="mt-1 text-sm text-red-600">{errors.guestName.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Phone Number
                                    </label>
                                    <input
                                        {...register('guestPhone')}
                                        type="tel"
                                        className="input w-full"
                                        placeholder="09XX XXX XXXX"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Email
                                    </label>
                                    <input
                                        {...register('guestEmail')}
                                        type="email"
                                        className={`input w-full ${errors.guestEmail ? 'input-error' : ''}`}
                                        placeholder="email@example.com"
                                    />
                                    {errors.guestEmail && (
                                        <p className="mt-1 text-sm text-red-600">{errors.guestEmail.message}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-primary" />
                                Stay Dates
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Check-in Date <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        {...register('checkInDate')}
                                        type="date"
                                        className={`input w-full ${errors.checkInDate ? 'input-error' : ''}`}
                                    />
                                    {errors.checkInDate && (
                                        <p className="mt-1 text-sm text-red-600">{errors.checkInDate.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Check-out Date <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        {...register('checkOutDate')}
                                        type="date"
                                        className={`input w-full ${errors.checkOutDate ? 'input-error' : ''}`}
                                    />
                                    {errors.checkOutDate && (
                                        <p className="mt-1 text-sm text-red-600">{errors.checkOutDate.message}</p>
                                    )}
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
                            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Search className="w-5 h-5 text-primary" />
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
                                                    <p className="text-sm text-gray-500 capitalize">{unit.type} • Up to {unit.capacity} guests</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold text-gray-900">{formatPeso(unit.base_price)}</p>
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
                                                        {formatPeso(unit.base_price * nights)} for {nights} night{nights !== 1 ? 's' : ''}
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
                                Additional Notes
                            </label>
                            <textarea
                                {...register('notes')}
                                rows={3}
                                className="input w-full"
                                placeholder="Any special requests or notes..."
                            />
                        </div>
                    </div>

                    {/* Right Column - Summary */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Booking Summary</h2>

                            {selectedUnits.length === 0 ? (
                                <p className="text-gray-500 text-sm py-4 text-center">
                                    Select units from the list
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
                                                <span className="text-sm font-medium">{formatPeso(su.unit.base_price * nights)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeUnit(su.unit.unit_id)}
                                                    className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="border-t border-gray-200 pt-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Subtotal</span>
                                    <span className="font-medium">{formatPeso(total)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Minimum Deposit Required</span>
                                    <span className="font-medium text-orange-600">{formatPeso(depositRequired)}</span>
                                </div>

                                {selectedUnits.length > 0 && (
                                    <>
                                        <PaymentSummaryBreakdown
                                            payNow={payNow}
                                            balanceOnSite={balanceOnSite}
                                            isFullPayment={total > 0 && payNow === total}
                                        />
                                        {canChoosePayNow && (
                                            <PayNowSelector
                                                value={payNow}
                                                presets={[
                                                    { label: 'Minimum', value: depositRequired },
                                                    { label: 'Half', value: Math.max(depositRequired, Math.round(total / 2)) },
                                                    { label: 'Full', value: total },
                                                ]}
                                                onSelectPreset={(value) => {
                                                    setPayNowError(null);
                                                    setPayNow(value);
                                                }}
                                                showCustomToggle
                                                customActive={showCustomPayNow}
                                                onToggleCustom={() => {
                                                    if (!showCustomPayNow) {
                                                        setPayNow(depositRequired);
                                                        setPayNowError(null);
                                                    }
                                                    setShowCustomPayNow((prev) => !prev);
                                                }}
                                                showCustomInput={showCustomPayNow}
                                                onCustomChange={(rawValue) => {
                                                    const raw = rawValue.replace(/[^\d]/g, '');
                                                    const next = raw ? Number(raw) : 0;
                                                    if (!Number.isFinite(next)) {
                                                        setPayNowError('Enter a valid amount.');
                                                        return;
                                                    }
                                                    if (next < depositRequired || next > total) {
                                                        setPayNowError(`Pay now must be between ${formatPeso(depositRequired)} and ${formatPeso(total)}.`);
                                                        setPayNow(Math.min(total, Math.max(depositRequired, next)));
                                                        return;
                                                    }
                                                    setPayNowError(null);
                                                    setPayNow(next);
                                                }}
                                                inputWrapperClassName="w-full"
                                                onCustomBlur={() => {
                                                    const next = computePayNow(depositRequired, total, payNow);
                                                    if (next !== payNow) {
                                                        setPayNow(next);
                                                    }
                                                    setPayNowError(null);
                                                }}
                                                error={payNowError}
                                                helperText={`Minimum deposit is ${formatPeso(depositRequired)}. You may pay more now to reduce your on-site balance.`}
                                                min={depositRequired}
                                                max={total}
                                                step={10}
                                            />
                                        )}
                                        {!canChoosePayNow && total > 0 && (
                                            <p className="text-xs text-gray-500">This booking requires full online payment.</p>
                                        )}
                                    </>
                                )}

                                <div className="flex justify-between items-center py-3 border-t border-gray-200">
                                    <span className="text-lg font-semibold text-gray-900">Total</span>
                                    <span className="text-xl font-bold text-primary">{formatPeso(total)}</span>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting || success || selectedUnits.length === 0}
                                className="w-full btn-primary mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-5 h-5" />
                                        Create Reservation
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </AdminLayout>
    );
}
