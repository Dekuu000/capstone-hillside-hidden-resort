import { computeTourMinimumDeposit, computeTourTotal, formatPeso } from './paymentUtils';

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

export { formatPeso };

export function computeTourPricing(input: TourPricingInput): TourPricingResult {
    const totalAmount = computeTourTotal(input.adultQty, input.kidQty, input.adultRate, input.kidRate);

    if (!input.isAdvance) {
        return {
            totalAmount,
            depositRequired: 0,
            paymentMessage: 'Walk-in: pay on-site',
        };
    }

    const depositRequired = computeTourMinimumDeposit(totalAmount);
    const paymentMessage = totalAmount <= 500
        ? 'Pay full online if total <= PHP 500'
        : 'Pay PHP 500 online, balance on-site';

    return { totalAmount, depositRequired, paymentMessage };
}
