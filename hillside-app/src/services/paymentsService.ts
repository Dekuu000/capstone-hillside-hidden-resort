import { supabase } from '../lib/supabase';

export async function fetchPaymentsByReservation(reservationId: string) {
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('reservation_id', reservationId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function fetchPendingPayments() {
    const { data, error } = await supabase
        .from('payments')
        .select(`
            *,
            reservation:reservations(
                reservation_code,
                total_amount,
                deposit_required,
                guest:users!guest_user_id(name, email)
            )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function submitPaymentProof(params: {
    reservationId: string;
    paymentType: 'deposit' | 'full';
    amount: number;
    method: 'gcash';
    referenceNo?: string;
    proofUrl?: string;
}) {
    const { data, error } = await supabase.rpc('submit_payment_proof', {
        p_reservation_id: params.reservationId,
        p_payment_type: params.paymentType,
        p_amount: params.amount,
        p_method: params.method,
        p_reference_no: params.referenceNo || null,
        p_proof_url: params.proofUrl || null,
    });
    if (error) throw error;
    return data;
}

export async function verifyPayment(params: { paymentId: string; approved: boolean }) {
    const { error } = await supabase.rpc('verify_payment', {
        p_payment_id: params.paymentId,
        p_approved: params.approved,
    });
    if (error) throw error;
}

export async function recordOnSitePayment(params: {
    reservationId: string;
    amount: number;
    method: 'cash' | 'gcash' | 'bank' | 'card';
    referenceNo?: string;
}) {
    const { data, error } = await supabase.rpc('record_on_site_payment', {
        p_reservation_id: params.reservationId,
        p_amount: params.amount,
        p_method: params.method,
        p_reference_no: params.referenceNo || null,
    });
    if (error) throw error;
    return data;
}

export async function updatePaymentIntentAmount(reservationId: string, amount: number) {
    const { error } = await supabase.rpc('update_payment_intent_amount', {
        p_reservation_id: reservationId,
        p_amount: amount,
    });
    if (error) throw error;
}
