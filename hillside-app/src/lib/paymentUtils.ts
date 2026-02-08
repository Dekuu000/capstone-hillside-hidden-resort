export function formatPeso(amount: number): string {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const hasDecimals = Math.abs(safeAmount % 1) > 0;
    const formatted = new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(safeAmount);
    return `\u20B1${formatted}`;
}

export function clampAmount(value: number, min: number, max: number): number {
    const safeMin = Number.isFinite(min) ? min : 0;
    const safeMax = Number.isFinite(max) ? max : safeMin;
    const safeValue = Number.isFinite(value) ? value : safeMin;
    if (safeMax < safeMin) return safeMin;
    return Math.min(safeMax, Math.max(safeMin, safeValue));
}

export function computePayNow(minDeposit: number, totalAmount: number, desired?: number): number {
    const safeTotal = Number.isFinite(totalAmount) ? totalAmount : 0;
    const min = Math.min(Number.isFinite(minDeposit) ? minDeposit : 0, safeTotal);
    const base = Number.isFinite(desired) ? (desired as number) : min;
    return clampAmount(base, min, safeTotal);
}

export function computeBalance(totalAmount: number, payNow: number): number {
    const safeTotal = Number.isFinite(totalAmount) ? totalAmount : 0;
    const safePayNow = Number.isFinite(payNow) ? payNow : 0;
    return Math.max(0, safeTotal - safePayNow);
}

export function computeTourTotal(adultQty: number, kidQty: number, adultRate: number, kidRate: number): number {
    const safeAdults = Math.max(0, adultQty);
    const safeKids = Math.max(0, kidQty);
    return (safeAdults * adultRate) + (safeKids * kidRate);
}

export function computeTourMinimumDeposit(totalAmount: number): number {
    const safeTotal = Number.isFinite(totalAmount) ? totalAmount : 0;
    return Math.min(500, safeTotal);
}

export function computeUnitDeposit(units: Array<{ name?: string; type?: string }>): number {
    if (!units || units.length === 0) return 0;
    const hasExclusiveAmenity = units.some(
        (unit) => unit.type === 'amenity' && /pavilion|function hall/i.test(unit.name || '')
    );
    const hasRoom = units.some((unit) => unit.type === 'room');
    const hasCottage = units.some((unit) => unit.type === 'cottage');
    if (hasExclusiveAmenity) return 1000;
    if (hasRoom) return 1000;
    if (hasCottage) return 500;
    return 0;
}
