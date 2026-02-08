import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Reservation, ReservationUnit, Unit, Service, ServiceBooking, Payment } from '../../types/database';
import { createReservationSchema, validateNotes } from '../../lib/validation';
import { handleSupabaseError, ReservationError, ErrorCodes } from '../../lib/errors';
import { z } from 'zod';
import {
    fetchReservations,
    fetchMyReservations,
    fetchReservation,
    fetchReservationByCode,
    fetchAvailableUnits,
    createReservationAtomic,
    cancelReservation,
    updateReservationStatus,
} from '../../services/reservationsService';

// Types for extended reservation data
export interface ReservationWithUnits extends Reservation {
    units: (ReservationUnit & { unit: Unit })[];
    service_bookings?: (ServiceBooking & { service: Service })[];
    payments?: Payment[];
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
            const data = await fetchReservations(status);
            return data as ReservationWithUnits[];
        },
    });
}

// Fetch current user's reservations (guest view)
export function useMyReservations(userId?: string) {
    return useQuery({
        queryKey: ['my-reservations', userId],
        queryFn: async () => {
            const data = await fetchMyReservations();
            return data as ReservationWithUnits[];
        },
        enabled: !!userId,
    });
}

// Fetch single reservation by ID
export function useReservation(reservationId: string | undefined) {
    return useQuery({
        queryKey: ['reservations', reservationId],
        queryFn: async () => {
            if (!reservationId) return null;
            const data = await fetchReservation(reservationId);
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
            const data = await fetchReservationByCode(code);
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
            const units = (await fetchAvailableUnits(checkIn, checkOut, unitType)) as Unit[];
            // De-duplicate by unit_id to guard against duplicate rows from RPC/join issues.
            const uniqueById = new Map<string, Unit>();
            for (const unit of units) {
                if (!uniqueById.has(unit.unit_id)) {
                    uniqueById.set(unit.unit_id, unit);
                }
            }
            return Array.from(uniqueById.values());
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
    expectedPayNow?: number;
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
                let data: any;
                try {
                    data = await createReservationAtomic({
                        guestUserId: input.guestUserId,
                        checkInDate: validated.checkInDate,
                        checkOutDate: validated.checkOutDate,
                        unitIds: validated.unitIds,
                        rates: input.units.map(u => u.rateSnapshot),
                        totalAmount,
                        depositRequired: input.depositRequired || totalAmount * 0.5,
                        expectedPayNow: input.expectedPayNow ?? undefined,
                        notes: validateNotes(validated.notes),
                    });
                } catch (error) {
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
                throw new ReservationError(
                    error instanceof Error ? error.message : 'Unknown error',
                    ErrorCodes.SYSTEM_ERROR,
                    500,
                    'An unexpected error occurred. Please try again.'
                );
            }
        },
        onSuccess: () => {
            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
            queryClient.invalidateQueries({ queryKey: ['available-units'] });
        },
        onError: () => {
            // Intentionally no console logs here to keep output clean
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
            const data = await updateReservationStatus({ reservationId, status, notes });
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
            await cancelReservation(reservationId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
            queryClient.invalidateQueries({ queryKey: ['available-units'] });
            queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
        },
    });
}
