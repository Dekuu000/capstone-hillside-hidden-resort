import { supabase } from '../lib/supabase';
import type {
    MyBookingsCursor,
    MyBookingsTab,
    MyBookingsResponse,
    ReservationListItem,
} from '../../../packages/shared/src/types';
import {
    myBookingsResponseSchema,
    reservationListItemSchema,
} from '../../../packages/shared/src/schemas';
import { callV2Api, isV2ApiFacadeEnabled } from './apiFacadeClient';

export type { MyBookingsTab, MyBookingsCursor };

export interface FetchBookingsParams {
    userId: string;
    tab: MyBookingsTab;
    limit?: number;
    cursor?: MyBookingsCursor | null;
    search?: string;
}

export interface FetchBookingsResult<T = ReservationListItem> {
    items: T[];
    nextCursor: MyBookingsCursor | null;
    totalCount: number;
}

const DEFAULT_LIMIT = 10;

export async function fetchBookingsPage<T = any>({
    userId,
    tab,
    limit = DEFAULT_LIMIT,
    cursor,
    search,
}: FetchBookingsParams): Promise<FetchBookingsResult<T>> {
    if (isV2ApiFacadeEnabled()) {
        const queryParams = new URLSearchParams();
        queryParams.set('tab', tab);
        queryParams.set('limit', String(limit));
        if (search?.trim()) queryParams.set('search', search.trim());
        if (cursor?.createdAt && cursor?.reservationId) {
            queryParams.set('cursor_created_at', cursor.createdAt);
            queryParams.set('cursor_reservation_id', cursor.reservationId);
            if (cursor.checkInDate) {
                queryParams.set('cursor_check_in_date', cursor.checkInDate);
            }
        }

        const data = await callV2Api<MyBookingsResponse>(
            `/v2/me/bookings?${queryParams.toString()}`,
            undefined,
            myBookingsResponseSchema
        );
        return {
            items: (data.items ?? []) as T[],
            nextCursor: data.nextCursor ?? null,
            totalCount: data.totalCount ?? 0,
        };
    }

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let query = supabase
        .from('reservations')
        .select(
            `
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
        `,
            { count: 'exact' }
        )
        .eq('guest_user_id', userId);

    if (tab === 'upcoming') {
        query = query
            .in('status', ['confirmed', 'for_verification'])
            .or(`check_out_date.gte.${todayIso},check_out_date.is.null`)
            .order('check_in_date', { ascending: true })
            .order('created_at', { ascending: true })
            .order('reservation_id', { ascending: true });

        if (cursor?.checkInDate) {
            query = query.or(
                `check_in_date.gt.${cursor.checkInDate},and(check_in_date.eq.${cursor.checkInDate},created_at.gt.${cursor.createdAt}),and(check_in_date.eq.${cursor.checkInDate},created_at.eq.${cursor.createdAt},reservation_id.gt.${cursor.reservationId})`
            );
        }
    } else if (tab === 'pending_payment') {
        query = query
            .eq('status', 'pending_payment')
            .order('created_at', { ascending: false })
            .order('reservation_id', { ascending: false });

        if (cursor) {
            query = query.or(
                `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},reservation_id.lt.${cursor.reservationId})`
            );
        }
    } else if (tab === 'completed') {
        query = query
            .eq('status', 'checked_out')
            .order('created_at', { ascending: false })
            .order('reservation_id', { ascending: false });

        if (cursor) {
            query = query.or(
                `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},reservation_id.lt.${cursor.reservationId})`
            );
        }
    } else {
        query = query
            .in('status', ['cancelled', 'no_show'])
            .order('created_at', { ascending: false })
            .order('reservation_id', { ascending: false });

        if (cursor) {
            query = query.or(
                `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},reservation_id.lt.${cursor.reservationId})`
            );
        }
    }

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
        query = query.ilike('reservation_code', `%${trimmedSearch}%`);
    }

    const { data, error, count } = await query.limit(limit + 1);
    if (error) throw error;

    const rows = (data ?? []) as T[];
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;
    const last = pageItems.length > 0 ? (pageItems[pageItems.length - 1] as any) : null;

    const nextCursor: MyBookingsCursor | null = hasMore && last
        ? {
            checkInDate: tab === 'upcoming' ? last.check_in_date : undefined,
            createdAt: last.created_at,
            reservationId: last.reservation_id,
        }
        : null;

    return {
        items: pageItems,
        nextCursor,
        totalCount: count ?? 0,
    };
}

export async function fetchBookingDetails<T = any>(reservationId: string): Promise<T> {
    if (!reservationId) {
        throw new Error('reservationId is required');
    }

    if (isV2ApiFacadeEnabled()) {
        const data = await callV2Api<ReservationListItem>(
            `/v2/me/bookings/${encodeURIComponent(reservationId)}`,
            undefined,
            reservationListItemSchema
        );
        return data as T;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('reservations')
        .select(
            `
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
        `
        )
        .eq('guest_user_id', user.id)
        .eq('reservation_id', reservationId)
        .single();

    if (error) throw error;
    return data as T;
}
