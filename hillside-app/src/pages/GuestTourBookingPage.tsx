import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, Ticket } from 'lucide-react';
import { GuestLayout } from '../components/layout/GuestLayout';
import { useAuth } from '../hooks/useAuth';
import { useServices, useCreateTourReservation } from '../features/services/useServices';
import { computeTourPricing, formatPeso } from '../lib/tourPricing';

export function GuestTourBookingPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { data: services, isLoading, error } = useServices();
    const createTour = useCreateTourReservation();

    const [serviceId, setServiceId] = useState('');
    const [visitDate, setVisitDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    const [adultQty, setAdultQty] = useState(1);
    const [kidQty, setKidQty] = useState(0);
    const [qtyError, setQtyError] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tempDate, setTempDate] = useState(visitDate);
    const [success, setSuccess] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const selectedService = services?.find(s => s.service_id === serviceId);
    const pricing = selectedService
        ? computeTourPricing({
            adultQty,
            kidQty,
            adultRate: selectedService.adult_rate,
            kidRate: selectedService.kid_rate,
            isAdvance: true,
        })
        : {
            totalAmount: 0,
            depositRequired: 0,
            paymentMessage: 'Pay full online if total <= PHP 500; otherwise pay PHP 500 online and the rest on-site',
        };
    const payNow = pricing.depositRequired;
    const balanceOnSite = Math.max(0, pricing.totalAmount - payNow);
    const isFullPayment = pricing.totalAmount > 0 && payNow === pricing.totalAmount;

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 640px)');
        const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
        setIsMobile(mq.matches);
        mq.addEventListener('change', handleChange);
        return () => mq.removeEventListener('change', handleChange);
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user) {
            setSubmitError('You must be logged in.');
            return;
        }
        if (!serviceId) {
            setSubmitError('Please select a tour service.');
            return;
        }
        if (adultQty + kidQty <= 0) {
            setSubmitError('At least one guest is required.');
            return;
        }

        try {
            setSubmitError(null);
            await createTour.mutateAsync({
                guestUserId: user.id,
                serviceId,
                visitDate,
                adultQty,
                kidQty,
                isAdvance: true,
                notes: notes || undefined,
            });
            setSuccess(true);
            setTimeout(() => navigate('/my-bookings'), 1500);
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed to create tour booking.');
        }
    }

    return (
        <GuestLayout>
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Book a Tour</h1>
                    <p className="text-gray-600 mt-1">Reserve a day or night tour in advance</p>
                </div>

                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-green-800">Tour reservation created!</p>
                            <p className="text-sm text-green-700 mt-1">Redirecting to your bookings...</p>
                        </div>
                    </div>
                )}

                {submitError && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                        <p className="text-sm text-red-800">{submitError}</p>
                    </div>
                )}

                {showDatePicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                        <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-5 space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Select visit date</h3>
                                <p className="text-xs text-gray-500 mt-1">Choose a date for your tour.</p>
                            </div>
                            <input
                                type="date"
                                className="input w-full"
                                value={tempDate}
                                min={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setTempDate(e.target.value)}
                                required
                            />
                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    className="px-3 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
                                    onClick={() => setShowDatePicker(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => {
                                        setVisitDate(tempDate);
                                        setShowDatePicker(false);
                                    }}
                                >
                                    Set Date
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select Tour</label>
                        {isLoading ? (
                            <div className="flex items-center gap-2 text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading services...
                            </div>
                        ) : error ? (
                            <p className="text-sm text-red-600">Failed to load services.</p>
                        ) : (
                            <select
                                className="input w-full"
                                value={serviceId}
                                onChange={(e) => setServiceId(e.target.value)}
                                required
                            >
                                <option value="">Select a service</option>
                                {services?.map(s => (
                                    <option key={s.service_id} value={s.service_id}>
                                        {s.service_name} ({s.start_time}–{s.end_time})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Visit Date</label>
                        <input
                            type="date"
                            className="input w-full"
                            value={visitDate}
                            min={new Date().toISOString().split('T')[0]}
                            readOnly={isMobile}
                            onClick={(e) => {
                                if (isMobile) {
                                    e.preventDefault();
                                    setTempDate(visitDate);
                                    setShowDatePicker(true);
                                }
                            }}
                            onChange={(e) => setVisitDate(e.target.value)}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Adults</label>
                            <input
                                type="number"
                                min="0"
                                className="input w-full"
                                value={adultQty}
                                onChange={(e) => {
                                    const next = Number(e.target.value);
                                    if (!Number.isFinite(next) || next < 0) {
                                        setAdultQty(0);
                                        setQtyError('Quantities must be 0 or greater.');
                                        return;
                                    }
                                    setQtyError(null);
                                    setAdultQty(next);
                                }}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Kids</label>
                            <input
                                type="number"
                                min="0"
                                className="input w-full"
                                value={kidQty}
                                onChange={(e) => {
                                    const next = Number(e.target.value);
                                    if (!Number.isFinite(next) || next < 0) {
                                        setKidQty(0);
                                        setQtyError('Quantities must be 0 or greater.');
                                        return;
                                    }
                                    setQtyError(null);
                                    setKidQty(next);
                                }}
                            />
                        </div>
                    </div>
                    {qtyError && (
                        <p className="text-xs text-red-600">{qtyError}</p>
                    )}

                    <div className="border border-gray-200 bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Ticket className="w-4 h-4 text-gray-700" />
                            <h3 className="text-sm font-semibold text-gray-900">Payment Summary</h3>
                        </div>

                        {!selectedService ? (
                            <p className="text-sm text-gray-600">Select a tour to see your payment breakdown.</p>
                        ) : (
                            <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-gray-600">Total</p>
                                    </div>
                                    <span className="font-medium text-gray-900">{formatPeso(pricing.totalAmount)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2">
                                    <div>
                                        <p className="text-gray-700">Pay now (online)</p>
                                        <p className="text-xs text-gray-500">Due today</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-gray-900">{formatPeso(payNow)}</p>
                                        <span
                                            className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                isFullPayment ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                            }`}
                                        >
                                            {isFullPayment ? 'Full payment' : 'Deposit'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-gray-600">Pay later (on-site)</p>
                                        <p className="text-xs text-gray-500">
                                            {balanceOnSite === 0 ? 'No balance due' : 'Due on arrival'}
                                        </p>
                                    </div>
                                    <span className="font-medium text-gray-900">{formatPeso(balanceOnSite)}</span>
                                </div>
                            </div>
                        )}
                        <p className="mt-3 text-xs text-gray-500">
                            ₱500 and below: pay full online. Above ₱500: pay ₱500 deposit now, balance on-site.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
                        <textarea
                            className="input w-full"
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={createTour.isPending || success}
                        className="btn-primary w-full"
                    >
                        {createTour.isPending ? 'Creating...' : 'Reserve Tour'}
                    </button>
                </form>
            </div>
        </GuestLayout>
    );
}
