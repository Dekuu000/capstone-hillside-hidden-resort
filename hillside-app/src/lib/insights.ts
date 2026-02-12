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
            detail: `Verified revenue reached ₱${Math.round(input.verifiedRevenue).toLocaleString()}.`,
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
