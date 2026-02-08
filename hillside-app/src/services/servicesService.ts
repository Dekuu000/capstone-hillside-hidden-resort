import { supabase } from '../lib/supabase';

export async function fetchServices() {
    const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('status', 'active')
        .order('service_type', { ascending: true });
    if (error) throw error;
    return data;
}

export async function createTourReservationAtomic(params: {
    guestUserId: string;
    serviceId: string;
    visitDate: string;
    adultQty: number;
    kidQty: number;
    isAdvance: boolean;
    expectedPayNow?: number;
    notes?: string | null;
}) {
    const { data, error } = await supabase.rpc('create_tour_reservation_atomic', {
        p_guest_user_id: params.guestUserId,
        p_service_id: params.serviceId,
        p_visit_date: params.visitDate,
        p_adult_qty: params.adultQty,
        p_kid_qty: params.kidQty,
        p_is_advance: params.isAdvance,
        p_expected_pay_now: params.expectedPayNow ?? null,
        p_deposit_override: null,
        p_notes: params.notes ?? null,
    });
    if (error) throw error;
    return data;
}
