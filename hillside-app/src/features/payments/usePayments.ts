import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Payment } from '../../types/database';
import type { PaymentWithReservation, RecordOnSitePaymentInput, SubmitPaymentInput, VerifyPaymentInput } from '../../types/payments';
import {
    fetchPaymentsByReservation,
    fetchPendingPayments,
    recordOnSitePayment,
    submitPaymentProof,
    verifyPayment,
} from '../../services/paymentsService';

export function usePaymentsByReservation(reservationId: string | undefined) {
    return useQuery({
        queryKey: ['payments', 'reservation', reservationId],
        queryFn: async () => {
            if (!reservationId) return [];
            const data = await fetchPaymentsByReservation(reservationId);
            return data as Payment[];
        },
        enabled: !!reservationId,
    });
}

export function usePendingPayments() {
    return useQuery({
        queryKey: ['payments', 'pending'],
        queryFn: async () => {
            const data = await fetchPendingPayments();
            return data as PaymentWithReservation[];
        },
    });
}

export function useSubmitPaymentProof() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: SubmitPaymentInput) => {
            const data = await submitPaymentProof({
                reservationId: input.reservationId,
                paymentType: input.paymentType,
                amount: input.amount,
                method: input.method,
                referenceNo: input.referenceNo || undefined,
                proofUrl: input.proofUrl || undefined,
            });
            return data as string;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
        },
    });
}

export function useVerifyPayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: VerifyPaymentInput) => {
            await verifyPayment({
                paymentId: input.paymentId,
                approved: input.approved,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
        },
    });
}

export function useRecordOnSitePayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: RecordOnSitePaymentInput) => {
            const data = await recordOnSitePayment({
                reservationId: input.reservationId,
                amount: input.amount,
                method: input.method,
                referenceNo: input.referenceNo || undefined,
            });
            return data as string;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
            queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
        },
    });
}
