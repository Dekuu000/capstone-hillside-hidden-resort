import { supabase } from '../lib/supabase';
import type { Reservation } from '../types/database';

export async function fetchReservations(status?: Reservation['status']) {
    let query = supabase
        .from('reservations')
        .select(`
            *,
            guest:users!guest_user_id(name, email, phone),
            units:reservation_units(
                *,
                unit:units(*)
            ),
            service_bookings:service_bookings(
                *,
                service:services(*)
            )
        `)
        .order('created_at', { ascending: false });

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function fetchMyReservations() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('reservations')
        .select(`
            *,
            units:reservation_units(
                *,
                unit:units(*)
            ),
            service_bookings:service_bookings(
                *,
                service:services(*)
            ),
            payments:payments(*)
        `)
        .eq('guest_user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

export async function fetchReservation(reservationId: string) {
    const { data, error } = await supabase
        .from('reservations')
        .select(`
            *,
            guest:users!guest_user_id(name, email, phone),
            units:reservation_units(
                *,
                unit:units(*)
            ),
            service_bookings:service_bookings(
                *,
                service:services(*)
            )
        `)
        .eq('reservation_id', reservationId)
        .single();
    if (error) throw error;
    return data;
}

export async function fetchReservationByCode(code: string) {
    const { data, error } = await supabase
        .from('reservations')
        .select(`
            *,
            units:reservation_units(
                *,
                unit:units(*)
            ),
            service_bookings:service_bookings(
                *,
                service:services(*)
            )
        `)
        .eq('reservation_code', code)
        .single();
    if (error) throw error;
    return data;
}

export async function fetchAvailableUnits(checkIn: string, checkOut: string, unitType?: string) {
    const { data, error } = await supabase.rpc('get_available_units', {
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_unit_type: unitType || null,
    });
    if (error) throw error;
    return data || [];
}

export async function createReservationAtomic(params: {
    guestUserId: string;
    checkInDate: string;
    checkOutDate: string;
    unitIds: string[];
    rates: number[];
    totalAmount: number;
    depositRequired?: number;
    expectedPayNow?: number;
    notes?: string | null;
}) {
    const { data, error } = await supabase.rpc('create_reservation_atomic', {
        p_guest_user_id: params.guestUserId,
        p_check_in: params.checkInDate,
        p_check_out: params.checkOutDate,
        p_unit_ids: params.unitIds,
        p_rates: params.rates,
        p_total_amount: params.totalAmount,
        p_deposit_required: params.depositRequired,
        p_expected_pay_now: params.expectedPayNow ?? null,
        p_notes: params.notes ?? null,
    });
    if (error) throw error;
    return data;
}

export async function cancelReservation(reservationId: string) {
    const { error } = await supabase.rpc('cancel_reservation', {
        p_reservation_id: reservationId,
    });
    if (error) throw error;
}

export async function updateReservationStatus(params: {
    reservationId: string;
    status: Reservation['status'];
    notes?: string;
}) {
    const updates: Partial<Reservation> = { status: params.status };
    if (params.notes) updates.notes = params.notes;

    const { data, error } = await supabase
        .from('reservations')
        .update(updates)
        .eq('reservation_id', params.reservationId)
        .select()
        .single();

    if (error) throw error;
    return data;
}
