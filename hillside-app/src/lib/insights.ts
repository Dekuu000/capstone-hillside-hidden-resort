import { formatPeso } from './paymentUtils';

export interface ReportInsightsInput {
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    pendingBookings: number;
    verifiedRevenue: number;
}

export interface ReportInsight {
    title: string;
    detail: string;
    tone?: 'neutral' | 'positive' | 'warning';
}

export function buildReportInsights(input: ReportInsightsInput): ReportInsight[] {
    const insights: ReportInsight[] = [];

    if (input.totalBookings === 0) {
        insights.push({
            title: 'No bookings in range',
            detail: 'Try expanding the date range to see activity.',
            tone: 'neutral',
        });
        return insights;
    }

    const cancelRate = input.totalBookings > 0
        ? (input.cancelledBookings / input.totalBookings) * 100
        : 0;

    if (input.verifiedRevenue > 0) {
        insights.push({
            title: 'Revenue recorded',
            detail: `Verified revenue reached ${formatPeso(input.verifiedRevenue)}.`,
            tone: 'positive',
        });
    }

    if (cancelRate >= 20) {
        insights.push({
            title: 'High cancellation rate',
            detail: `Cancellations are ${cancelRate.toFixed(0)}% of bookings.`,
            tone: 'warning',
        });
    } else {
        insights.push({
            title: 'Healthy cancellation rate',
            detail: `Cancellations are ${cancelRate.toFixed(0)}% of bookings.`,
            tone: 'neutral',
        });
    }

    if (input.pendingBookings > 0) {
        insights.push({
            title: 'Pending payments',
            detail: `${input.pendingBookings} booking(s) still need payment verification.`,
            tone: 'warning',
        });
    }

    return insights;
}

export interface AnalyticsInsightsInput {
    bookings: number;
    cancellations: number;
    cashCollected: number;
    occupancyRate: number;
    unitBookedValue: number;
    tourBookedValue: number;
}

export function buildAnalyticsInsights(input: AnalyticsInsightsInput): ReportInsight[] {
    const insights: ReportInsight[] = [];

    if (input.bookings === 0) {
        insights.push({
            title: 'No bookings in range',
            detail: 'Try expanding the date range to see activity.',
            tone: 'neutral',
        });
        return insights;
    }

    const cancelRate = input.bookings > 0
        ? (input.cancellations / input.bookings) * 100
        : 0;

    if (input.cashCollected > 0) {
        insights.push({
            title: 'Cash collected',
            detail: `Cash collected reached ${formatPeso(input.cashCollected)}.`,
            tone: 'positive',
        });
    }

    if (input.occupancyRate >= 0.7) {
        insights.push({
            title: 'High occupancy',
            detail: `Occupancy averaged ${(input.occupancyRate * 100).toFixed(0)}% in this range.`,
            tone: 'positive',
        });
    } else if (input.occupancyRate <= 0.3) {
        insights.push({
            title: 'Low occupancy',
            detail: `Occupancy averaged ${(input.occupancyRate * 100).toFixed(0)}% in this range.`,
            tone: 'warning',
        });
    }

    if (cancelRate >= 20) {
        insights.push({
            title: 'High cancellation rate',
            detail: `Cancellations are ${cancelRate.toFixed(0)}% of bookings.`,
            tone: 'warning',
        });
    } else {
        insights.push({
            title: 'Healthy cancellation rate',
            detail: `Cancellations are ${cancelRate.toFixed(0)}% of bookings.`,
            tone: 'neutral',
        });
    }

    if (input.tourBookedValue > input.unitBookedValue && input.tourBookedValue > 0) {
        insights.push({
            title: 'Tours outperform units',
            detail: 'Tour bookings generated more value than unit bookings in this range.',
            tone: 'positive',
        });
    } else if (input.unitBookedValue > 0 && input.unitBookedValue >= input.tourBookedValue) {
        insights.push({
            title: 'Units lead revenue',
            detail: 'Unit bookings generated more value than tour bookings in this range.',
            tone: 'neutral',
        });
    }

    return insights;
}
