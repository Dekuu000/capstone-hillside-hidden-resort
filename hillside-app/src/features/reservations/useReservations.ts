import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Reservation, ReservationUnit, Unit } from '../../types/database';
import { createReservationSchema, validateNotes } from '../../lib/validation';
import { handleSupabaseError, ReservationError, ErrorCodes } from '../../lib/errors';
import { z } from 'zod';

// Types for extended reservation data
export interface ReservationWithUnits extends Reservation {
    units: (ReservationUnit & { unit: Unit })[];
    guest?: {
        name: string;
        email?: string;
        phone?: string;
    };
}

// Fetch all reservations (admin view)
export function useReservations(status?: Reservation['status']) {
    return useQuery({
        queryKey: ['reservations', status],
        queryFn: async () => {
            let query = supabase
                .from('reservations')
                .select(`
                    *,
                    guest:users!guest_user_id(name, email, phone),
                    units:reservation_units(
                        *,
                        unit:units(*)
                    )
                `)
                .order('created_at', { ascending: false });

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as ReservationWithUnits[];
        },
    });
}

// Fetch current user's reservations (guest view)
export function useMyReservations() {
    return useQuery({
        queryKey: ['my-reservations'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    units:reservation_units(
                        *,
                        unit:units(*)
                    )
                `)
                .eq('guest_user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as ReservationWithUnits[];
        },
    });
}

// Fetch single reservation by ID
export function useReservation(reservationId: string | undefined) {
    return useQuery({
        queryKey: ['reservations', reservationId],
        queryFn: async () => {
            if (!reservationId) return null;
            const { data, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    guest:users!guest_user_id(name, email, phone),
                    units:reservation_units(
                        *,
                        unit:units(*)
                    )
                `)
                .eq('reservation_id', reservationId)
                .single();
            if (error) throw error;
            return data as ReservationWithUnits;
        },
        enabled: !!reservationId,
    });
}

// Fetch reservation by code (for guest lookup)
export function useReservationByCode(code: string | undefined) {
    return useQuery({
        queryKey: ['reservations', 'code', code],
        queryFn: async () => {
            if (!code) return null;
            const { data, error } = await supabase
                .from('reservations')
                .select(`
                    *,
                    units:reservation_units(
                        *,
                        unit:units(*)
                    )
                `)
                .eq('reservation_code', code)
                .single();
            if (error) throw error;
            return data as ReservationWithUnits;
        },
        enabled: !!code,
    });
}

// Check availability for date range
export function useAvailableUnits(checkIn: string, checkOut: string, unitType?: string) {
    return useQuery({
        queryKey: ['available-units', checkIn, checkOut, unitType],
        queryFn: async () => {
            const { data, error } = await supabase
                .rpc('get_available_units', {
                    p_check_in: checkIn,
                    p_check_out: checkOut,
                    p_unit_type: unitType || null,
                });
            if (error) throw error;
            return data as Unit[];
        },
        enabled: !!checkIn && !!checkOut,
    });
}

// Create new reservation
interface CreateReservationInput {
    guestUserId: string;
    checkInDate: string;
    checkOutDate: string;
    units: { unitId: string; rateSnapshot: number; nights: number }[];
    totalAmount: number;
    depositRequired?: number;
    notes?: string;
}

export function useCreateReservation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateReservationInput) => {
            try {
                // Validate input using Zod schema
                const validated = createReservationSchema.parse({
                    checkInDate: input.checkInDate,
                    checkOutDate: input.checkOutDate,
                    unitIds: input.units.map(u => u.unitId),
                    notes: input.notes,
                });

                // Calculate total amount from units
                const totalAmount = input.units.reduce((sum, u) =>
                    sum + (u.rateSnapshot * u.nights), 0
                );

                // Validate total is positive
                if (totalAmount <= 0) {
                    throw new ReservationError(
                        'Invalid total amount',
                        ErrorCodes.INVALID_INPUT,
                        400,
                        'Total amount must be greater than zero'
                    );
                }

                // Call atomic stored procedure
                const { data, error } = await supabase.rpc('create_reservation_atomic', {
                    p_guest_user_id: input.guestUserId,
                    p_check_in: validated.checkInDate,
                    p_check_out: validated.checkOutDate,
                    p_unit_ids: validated.unitIds,
                    p_rates: input.units.map(u => u.rateSnapshot),
                    p_total_amount: totalAmount,
                    p_deposit_required: input.depositRequired || totalAmount * 0.5,
                    p_notes: validateNotes(validated.notes),
                });

                if (error) {
                    handleSupabaseError(error);
                }

                if (!data || data.length === 0) {
                    throw new ReservationError(
                        'No response from server',
                        ErrorCodes.SYSTEM_ERROR,
                        500,
                        'Failed to create reservation. Please try again.'
                    );
                }

                // Return the reservation data from stored procedure
                // Format: { reservation_id, reservation_code, status, message }
                return data[0];
            } catch (error) {
                // Handle validation errors
                if (error instanceof z.ZodError) {
                    const firstError = error.issues[0];
                    throw new ReservationError(
                        'Validation failed',
                        ErrorCodes.INVALID_INPUT,
                        400,
                        firstError?.message || 'Invalid input'
                    );
                }

                // Re-throw if already a ReservationError
                if (error instanceof ReservationError) {
                    throw error;
                }

                // Handle unexpected errors
                console.error('Unexpected error in useCreateReservation:', error);
                throw new ReservationError(
                    error instanceof Error ? error.message : 'Unknown error',
                    ErrorCodes.SYSTEM_ERROR,
                    500,
                    'An unexpected error occurred. Please try again.'
                );
            }
        },
        onSuccess: (data) => {
            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
            queryClient.invalidateQueries({ queryKey: ['available-units'] });

            // Log success (optional)
            console.log('Reservation created successfully:', data.reservation_code);
        },
        onError: (error) => {
            // Log error for debugging
            console.error('Failed to create reservation:', error);
        },
    });
}

// Update reservation status
export function useUpdateReservationStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ reservationId, status, notes }: {
            reservationId: string;
            status: Reservation['status'];
            notes?: string
        }) => {
            const updates: Partial<Reservation> = { status };
            if (notes) updates.notes = notes;

            const { data, error } = await supabase
                .from('reservations')
                .update(updates)
                .eq('reservation_id', reservationId)
                .select()
                .single();

            if (error) throw error;
            return data as Reservation;
        },
        onSuccess: (_, { reservationId }) => {
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
            queryClient.invalidateQueries({ queryKey: ['reservations', reservationId] });
            queryClient.invalidateQueries({ queryKey: ['available-units'] });
        },
    });
}

// Cancel reservation
export function useCancelReservation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (reservationId: string) => {
            const { error } = await supabase
                .from('reservations')
                .update({ status: 'cancelled' })
                .eq('reservation_id', reservationId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
            queryClient.invalidateQueries({ queryKey: ['available-units'] });
        },
    });
}
