import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle, AlertCircle, Loader2, Ticket } from 'lucide-react';
import { AdminLayout } from '../components/layout/AdminLayout';
import { useAuth } from '../hooks/useAuth';
import { useServices, useCreateTourReservation } from '../features/services/useServices';
import { computeTourPricing } from '../lib/tourPricing';

export function AdminTourBookingPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { data: services, isLoading, error } = useServices();
    const createTour = useCreateTourReservation();

    const [serviceId, setServiceId] = useState('');
    const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
    const [adultQty, setAdultQty] = useState(1);
    const [kidQty, setKidQty] = useState(0);
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [success, setSuccess] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const selectedService = services?.find(s => s.service_id === serviceId);
    const pricing = selectedService
        ? computeTourPricing({
            adultQty,
            kidQty,
            adultRate: selectedService.adult_rate,
            kidRate: selectedService.kid_rate,
            isAdvance: false,
        })
        : { totalAmount: 0, depositRequired: 0, paymentMessage: 'Walk-in: pay on-site' };

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
            const combinedNotes = [
                guestName ? `Walk-in: ${guestName}` : null,
                guestPhone ? `Phone: ${guestPhone}` : null,
                notes ? `Notes: ${notes}` : null,
            ].filter(Boolean).join(' | ');

            await createTour.mutateAsync({
                guestUserId: user.id,
                serviceId,
                visitDate,
                adultQty,
                kidQty,
                isAdvance: false,
                notes: combinedNotes || undefined,
            });

            setSuccess(true);
            setTimeout(() => navigate('/admin/reservations'), 1500);
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed to create walk-in tour.');
        }
    }

    return (
        <AdminLayout>
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Walk-in Tour</h1>
                    <p className="text-gray-600 mt-1">Create an on-site tour booking</p>
                </div>

                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-green-800">Tour booking created!</p>
                            <p className="text-sm text-green-700 mt-1">Redirecting to reservations...</p>
                        </div>
                    </div>
                )}

                {submitError && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                        <p className="text-sm text-red-800">{submitError}</p>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Visit Date</label>
                            <input
                                type="date"
                                className="input w-full"
                                value={visitDate}
                                onChange={(e) => setVisitDate(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-6">
                            <Calendar className="w-4 h-4" />
                            Walk-in: pay on-site (no deposit)
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Adults</label>
                            <input
                                type="number"
                                min="0"
                                className="input w-full"
                                value={adultQty}
                                onChange={(e) => setAdultQty(Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Kids</label>
                            <input
                                type="number"
                                min="0"
                                className="input w-full"
                                value={kidQty}
                                onChange={(e) => setKidQty(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Guest Name</label>
                            <input
                                className="input w-full"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                placeholder="Walk-in guest"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Guest Phone</label>
                            <input
                                className="input w-full"
                                value={guestPhone}
                                onChange={(e) => setGuestPhone(e.target.value)}
                                placeholder="09XX XXX XXXX"
                            />
                        </div>
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

                    <div className="border-t border-gray-200 pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-gray-700">
                                <Ticket className="w-4 h-4" />
                                <span>Total</span>
                            </div>
                            <span className="text-lg font-semibold text-primary">₱{pricing.totalAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={createTour.isPending || success}
                        className="btn-primary w-full"
                    >
                        {createTour.isPending ? 'Creating...' : 'Create Walk-in Tour'}
                    </button>
                </form>
            </div>
        </AdminLayout>
    );
}
