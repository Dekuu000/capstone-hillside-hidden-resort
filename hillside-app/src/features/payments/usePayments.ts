import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Payment } from '../../types/database';

export interface PaymentWithReservation extends Payment {
    reservation?: {
        reservation_code: string;
        total_amount: number;
        deposit_required?: number;
        guest?: {
            name: string;
            email?: string;
        };
    };
}

export function usePaymentsByReservation(reservationId: string | undefined) {
    return useQuery({
        queryKey: ['payments', 'reservation', reservationId],
        queryFn: async () => {
            if (!reservationId) return [];
            const { data, error } = await supabase
                .from('payments')
                .select('*')
                .eq('reservation_id', reservationId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data as Payment[];
        },
        enabled: !!reservationId,
    });
}

export function usePendingPayments() {
    return useQuery({
        queryKey: ['payments', 'pending'],
        queryFn: async () => {
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
            return data as PaymentWithReservation[];
        },
    });
}

interface SubmitPaymentInput {
    reservationId: string;
    paymentType: 'deposit' | 'full';
    amount: number;
    method: 'gcash';
    referenceNo?: string;
    proofUrl?: string;
}

export function useSubmitPaymentProof() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: SubmitPaymentInput) => {
            const { data, error } = await supabase.rpc('submit_payment_proof', {
                p_reservation_id: input.reservationId,
                p_payment_type: input.paymentType,
                p_amount: input.amount,
                p_method: input.method,
                p_reference_no: input.referenceNo || null,
                p_proof_url: input.proofUrl || null,
            });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
        },
    });
}

interface VerifyPaymentInput {
    paymentId: string;
    approved: boolean;
}

export function useVerifyPayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: VerifyPaymentInput) => {
            const { error } = await supabase.rpc('verify_payment', {
                p_payment_id: input.paymentId,
                p_approved: input.approved,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
        },
    });
}

interface RecordOnSitePaymentInput {
    reservationId: string;
    amount: number;
    method: 'cash' | 'gcash' | 'bank' | 'card';
    referenceNo?: string;
}

export function useRecordOnSitePayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: RecordOnSitePaymentInput) => {
            const { data, error } = await supabase.rpc('record_on_site_payment', {
                p_reservation_id: input.reservationId,
                p_amount: input.amount,
                p_method: input.method,
                p_reference_no: input.referenceNo || null,
            });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
            queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
        },
    });
}
