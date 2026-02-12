import { supabase } from '../lib/supabase';
import type { Reservation, Payment } from '../types/database';

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
