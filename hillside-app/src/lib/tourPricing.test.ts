import { describe, expect, it } from 'vitest';
import { computeTourPricing } from './tourPricing';

describe('computeTourPricing', () => {
    it('computes total for advance booking and full payment when total <= 500', () => {
        const result = computeTourPricing({
            adultQty: 3,
            kidQty: 0,
            adultRate: 100,
            kidRate: 80,
            isAdvance: true,
        });
        expect(result.totalAmount).toBe(300);
        expect(result.depositRequired).toBe(300);
        expect(result.paymentMessage).toBe('Pay full online if total <= PHP 500');
    });

    it('computes deposit of 500 when total > 500 for advance booking', () => {
        const result = computeTourPricing({
            adultQty: 5,
            kidQty: 1,
            adultRate: 120,
            kidRate: 100,
            isAdvance: true,
        });
        expect(result.totalAmount).toBe(700);
        expect(result.depositRequired).toBe(500);
        expect(result.paymentMessage).toBe('Pay PHP 500 online, balance on-site');
    });

    it('returns zero deposit for walk-in', () => {
        const result = computeTourPricing({
            adultQty: 2,
            kidQty: 1,
            adultRate: 100,
            kidRate: 80,
            isAdvance: false,
        });
        expect(result.totalAmount).toBe(280);
        expect(result.depositRequired).toBe(0);
        expect(result.paymentMessage).toBe('Walk-in: pay on-site');
    });
});
