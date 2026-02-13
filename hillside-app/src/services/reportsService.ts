import { supabase } from '../lib/supabase';
import type { Reservation, Payment } from '../types/database';

export interface ReportSummaryRow {
    bookings: number;
    cancellations: number;
    cash_collected: number;
    occupancy_rate: number;
    unit_booked_value: number;
    tour_booked_value: number;
}

export interface ReportDailyRow extends ReportSummaryRow {
    report_date: string;
}

export interface ReportMonthlyRow extends ReportSummaryRow {
    report_month: string;
}

export async function fetchReservationsInRange(fromIso: string, toIso: string) {
    const { data, error } = await supabase
        .from('reservations')
        .select('reservation_id, reservation_code, status, total_amount, created_at')
        .gte('created_at', fromIso)
        .lte('created_at', toIso);
    if (error) throw error;
    return data as Pick<Reservation, 'reservation_id' | 'reservation_code' | 'status' | 'total_amount' | 'created_at'>[];
}

export async function fetchVerifiedPaymentsInRange(fromIso: string, toIso: string) {
    const { data, error } = await supabase
        .from('payments')
        .select('payment_id, reservation_id, amount, status, method, payment_type, created_at, verified_at')
        .eq('status', 'verified')
        .gte('verified_at', fromIso)
        .lte('verified_at', toIso);
    if (error) throw error;
    return data as Pick<Payment, 'payment_id' | 'reservation_id' | 'amount' | 'status' | 'method' | 'payment_type' | 'created_at' | 'verified_at'>[];
}

export async function fetchPaymentTransactionsInRange(fromIso: string, toIso: string) {
    const { data, error } = await supabase
        .from('payments')
        .select(`
            payment_id,
            amount,
            status,
            method,
            payment_type,
            created_at,
            verified_at,
            reservation:reservations(reservation_code)
        `)
        .gte('created_at', fromIso)
        .lte('created_at', toIso);
    if (error) throw error;
    return data as Array<{
        payment_id: string;
        amount: number;
        status: string;
        method: string;
        payment_type: string;
        created_at: string;
        verified_at?: string | null;
        reservation?: { reservation_code?: string | null } | null;
    }>;
}

export async function fetchReportSummary(startDate: string, endDate: string) {
    const { data, error } = await supabase.rpc('get_report_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
    });
    if (error) throw error;
    const row = (data?.[0] ?? null) as ReportSummaryRow | null;
    return row ?? {
        bookings: 0,
        cancellations: 0,
        cash_collected: 0,
        occupancy_rate: 0,
        unit_booked_value: 0,
        tour_booked_value: 0,
    };
}

export async function fetchReportDaily(startDate: string, endDate: string) {
    const { data, error } = await supabase.rpc('get_report_daily', {
        p_start_date: startDate,
        p_end_date: endDate,
    });
    if (error) throw error;
    return (data ?? []) as ReportDailyRow[];
}

export async function fetchReportMonthly(startDate: string, endDate: string) {
    const { data, error } = await supabase.rpc('get_report_monthly', {
        p_start_date: startDate,
        p_end_date: endDate,
    });
    if (error) throw error;
    return (data ?? []) as ReportMonthlyRow[];
}
