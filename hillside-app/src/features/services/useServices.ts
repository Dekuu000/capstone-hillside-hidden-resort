import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Service } from '../../types/database';
import { createTourReservationAtomic, fetchServices } from '../../services/servicesService';

export function useServices() {
    return useQuery({
        queryKey: ['services'],
        queryFn: async () => {
            const data = await fetchServices();
            return data as Service[];
        },
    });
}

interface CreateTourReservationInput {
    guestUserId: string;
    serviceId: string;
    visitDate: string;
    adultQty: number;
    kidQty: number;
    isAdvance: boolean;
    expectedPayNow?: number;
    notes?: string;
}

export function useCreateTourReservation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateTourReservationInput) => {
            const data = await createTourReservationAtomic({
                guestUserId: input.guestUserId,
                serviceId: input.serviceId,
                visitDate: input.visitDate,
                adultQty: input.adultQty,
                kidQty: input.kidQty,
                isAdvance: input.isAdvance,
                expectedPayNow: input.expectedPayNow ?? undefined,
                notes: input.notes || null,
            });
            if (!data || data.length === 0) {
                throw new Error('No response from server');
            }
            return data[0] as { reservation_id: string; reservation_code: string };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
        },
    });
}
