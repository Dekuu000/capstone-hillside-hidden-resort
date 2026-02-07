import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Service } from '../../types/database';

export function useServices() {
    return useQuery({
        queryKey: ['services'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('services')
                .select('*')
                .eq('status', 'active')
                .order('service_type', { ascending: true });
            if (error) throw error;
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
    notes?: string;
}

export function useCreateTourReservation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateTourReservationInput) => {
            const { data, error } = await supabase.rpc('create_tour_reservation_atomic', {
                p_guest_user_id: input.guestUserId,
                p_service_id: input.serviceId,
                p_visit_date: input.visitDate,
                p_adult_qty: input.adultQty,
                p_kid_qty: input.kidQty,
                p_is_advance: input.isAdvance,
                p_deposit_override: null,
                p_notes: input.notes || null,
            });
            if (error) throw new Error(error.message);
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
