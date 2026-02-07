export interface TourPricingInput {
    adultQty: number;
    kidQty: number;
    adultRate: number;
    kidRate: number;
    isAdvance: boolean;
}

export interface TourPricingResult {
    totalAmount: number;
    depositRequired: number;
    paymentMessage: string;
}

export function formatPeso(amount: number): string {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const hasDecimals = Math.abs(safeAmount % 1) > 0;
    const formatted = new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(safeAmount);
    return `₱${formatted}`;
}

export function computeTourPricing(input: TourPricingInput): TourPricingResult {
    const adultQty = Math.max(0, input.adultQty);
    const kidQty = Math.max(0, input.kidQty);
    const totalAmount = (adultQty * input.adultRate) + (kidQty * input.kidRate);

    if (!input.isAdvance) {
        return {
            totalAmount,
            depositRequired: 0,
            paymentMessage: 'Walk-in: pay on-site',
        };
    }

    const depositRequired = Math.min(500, totalAmount);
    const paymentMessage = totalAmount <= 500
        ? 'Pay full online if total <= PHP 500'
        : 'Pay PHP 500 online, balance on-site';

    return { totalAmount, depositRequired, paymentMessage };
}
