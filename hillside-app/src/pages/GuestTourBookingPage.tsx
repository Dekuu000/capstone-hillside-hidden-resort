import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, Ticket } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import { GuestLayout } from '../components/layout/GuestLayout';
import { useAuth } from '../hooks/useAuth';
import { useServices, useCreateTourReservation } from '../features/services/useServices';
import { computeTourPricing } from '../lib/tourPricing';
import { formatPeso } from '../lib/formatting';
import { computeBalance, computePayNow } from '../lib/paymentUtils';
import { PaymentSummaryBreakdown } from '../components/payments/PaymentSummaryBreakdown';
import { PayNowSelector } from '../components/payments/PayNowSelector';
import { AvailabilityDatePicker } from '../components/date/AvailabilityRangePicker';

export function GuestTourBookingPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { data: services, isLoading, error } = useServices();
    const createTour = useCreateTourReservation();

    const [serviceId, setServiceId] = useState('');
    const [visitDate, setVisitDate] = useState(format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));
    const [adultQty, setAdultQty] = useState(1);
    const [kidQty, setKidQty] = useState(0);
    const [qtyError, setQtyError] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [payNow, setPayNow] = useState(0);
    const [payNowError, setPayNowError] = useState<string | null>(null);
    const [showCustomPayNow, setShowCustomPayNow] = useState(false);
    const [success, setSuccess] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const servicesErrorMessage = (() => {
        if (!error) return '';
        if (error instanceof Error && error.message) return error.message;
        const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
        const parts = [maybe?.message, maybe?.details, maybe?.hint, maybe?.code].filter(Boolean);
        if (parts.length > 0) return parts.join(' | ');
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    })();

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
    const minimumDeposit = pricing.depositRequired;
    const balanceOnSite = computeBalance(pricing.totalAmount, payNow);
    const isFullPayment = pricing.totalAmount > 0 && payNow === pricing.totalAmount;
    const canChoosePayNow = pricing.totalAmount > minimumDeposit;

    useEffect(() => {
        if (!selectedService) {
            setPayNow(0);
            setPayNowError(null);
            setShowCustomPayNow(false);
            return;
        }
        const minPay = minimumDeposit;
        const maxPay = pricing.totalAmount;
        setPayNow((current) => {
            const base = current > 0 ? current : minPay;
            return computePayNow(minPay, maxPay, base);
        });
        setPayNowError(null);
        setShowCustomPayNow(false);
    }, [selectedService, minimumDeposit, pricing.totalAmount]);

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
                expectedPayNow: payNow,
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

                <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select Tour</label>
                        {isLoading ? (
                            <div className="flex items-center gap-2 text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading services...
                            </div>
                        ) : error ? (
                            <div className="text-sm text-red-600">
                                <p>Failed to load services.</p>
                                {servicesErrorMessage && (
                                    <p className="mt-1 text-xs text-red-500 break-words">{servicesErrorMessage}</p>
                                )}
                            </div>
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
                        <AvailabilityDatePicker
                            value={isValid(parseISO(visitDate)) ? parseISO(visitDate) : undefined}
                            onChange={(date) => {
                                if (!date) return;
                                setVisitDate(format(date, 'yyyy-MM-dd'));
                            }}
                            disabledBefore={new Date()}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Adults</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="input w-full"
                                value={adultQty}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/[^\d]/g, '');
                                    const normalized = raw.replace(/^0+(?=\d)/, '');
                                    const next = normalized ? Number(normalized) : 0;
                                    if (!Number.isFinite(next)) {
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
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="input w-full"
                                value={kidQty}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/[^\d]/g, '');
                                    const normalized = raw.replace(/^0+(?=\d)/, '');
                                    const next = normalized ? Number(normalized) : 0;
                                    if (!Number.isFinite(next)) {
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
                                <PaymentSummaryBreakdown
                                    payNow={payNow}
                                    balanceOnSite={balanceOnSite}
                                    isFullPayment={isFullPayment}
                                    className="bg-white/70"
                                />
                            </div>
                        )}
                        {selectedService && canChoosePayNow && (
                            <PayNowSelector
                                value={payNow}
                                presets={[
                                    { label: 'Minimum', value: minimumDeposit },
                                    { label: 'Half', value: Math.max(minimumDeposit, Math.round(pricing.totalAmount / 2)) },
                                    { label: 'Full', value: pricing.totalAmount },
                                ]}
                                onSelectPreset={(value) => {
                                    setPayNowError(null);
                                    setPayNow(value);
                                }}
                                showCustomToggle
                                customActive={showCustomPayNow}
                                onToggleCustom={() => {
                                    if (!showCustomPayNow) {
                                        setPayNow(minimumDeposit);
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
                                    setPayNow(next);
                                    if (next < minimumDeposit) {
                                        setPayNowError(`Minimum deposit is ${formatPeso(minimumDeposit)}.`);
                                    } else if (next > pricing.totalAmount) {
                                        setPayNowError(`Cannot exceed total ${formatPeso(pricing.totalAmount)}.`);
                                    } else {
                                        setPayNowError(null);
                                    }
                                }}
                                onCustomBlur={() => {
                                    const next = computePayNow(minimumDeposit, pricing.totalAmount, payNow);
                                    if (next !== payNow) {
                                        setPayNow(next);
                                    }
                                    setPayNowError(null);
                                }}
                                error={payNowError}
                                helperText={`Minimum deposit is ${formatPeso(minimumDeposit)}. You may pay more now to reduce your on-site balance.`}
                                min={minimumDeposit}
                                max={pricing.totalAmount}
                                step={10}
                                showCurrencyPrefix
                                inputWrapperClassName="w-full md:w-40"
                            />
                        )}
                        {selectedService && !canChoosePayNow && (
                            <p className="mt-3 text-xs text-gray-500">This booking requires full online payment.</p>
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
