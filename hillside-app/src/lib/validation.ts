/**
 * Validation Schemas and Input Sanitization
 * 
 * This module provides Zod schemas for client-side validation
 * and sanitization functions to prevent XSS attacks.
 */

import { z } from 'zod';

// ====================
// Date Validation Helpers
// ====================

/**
 * Validates a date string in YYYY-MM-DD format that must be in the future
 */
const futureDate = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
    .refine((date) => {
        const d = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d >= today;
    }, 'Date must be today or in the future');

/**
 * Validates a date string in YYYY-MM-DD format
 */
const dateString = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)');

// ====================
// Reservation Validation Schemas
// ====================

/**
 * Schema for creating a new reservation
 * 
 * Validates:
 * - Check-in/out dates in proper format and order
 * - At least 1 unit, maximum 10 units
 * - Maximum 30 night stay
 * - Optional notes (max 500 chars)
 */
export const createReservationSchema = z.object({
    checkInDate: futureDate,
    checkOutDate: dateString,
    unitIds: z.array(z.string().uuid('Invalid unit ID'))
        .min(1, 'Select at least one unit')
        .max(10, 'Maximum 10 units per reservation'),
    notes: z.string()
        .max(500, 'Notes cannot exceed 500 characters')
        .optional()
        .transform(val => val?.trim()),
}).refine((data) => {
    const checkIn = new Date(data.checkInDate);
    const checkOut = new Date(data.checkOutDate);
    return checkOut > checkIn;
}, {
    message: 'Check-out date must be after check-in date',
    path: ['checkOutDate']
}).refine((data) => {
    const checkIn = new Date(data.checkInDate);
    const checkOut = new Date(data.checkOutDate);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    return nights <= 30;
}, {
    message: 'Maximum stay is 30 nights',
    path: ['checkOutDate']
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/**
 * Schema for checking unit availability
 */
export const availabilitySchema = z.object({
    checkIn: dateString,
    checkOut: dateString,
    unitType: z.enum(['room', 'cottage', 'amenity']).optional(),
}).refine((data) => {
    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);
    return checkOutDate > checkInDate;
}, {
    message: 'Check-out must be after check-in',
    path: ['checkOut']
});

export type AvailabilityInput = z.infer<typeof availabilitySchema>;

/**
 * Schema for updating reservation status (admin only)
 */
export const updateReservationStatusSchema = z.object({
    status: z.enum([
        'pending_payment',
        'for_verification',
        'confirmed',
        'checked_in',
        'checked_out',
        'cancelled',
        'no_show'
    ]),
    notes: z.string()
        .max(500, 'Notes cannot exceed 500 characters')
        .optional()
        .transform(val => val?.trim()),
});

export type UpdateReservationStatusInput = z.infer<typeof updateReservationStatusSchema>;

// ====================
// Input Sanitization
// ====================

/**
 * Sanitizes HTML to prevent XSS attacks
 * Converts dangerous characters to HTML entities
 * 
 * @param input - Raw user input string
 * @returns Sanitized string safe for display
 */
export function sanitizeInput(input: string): string {
    if (!input) return '';

    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .trim();
}

/**
 * Validates and sanitizes reservation notes
 * 
 * @param notes - Optional notes from user
 * @returns Sanitized notes or undefined
 * @throws Error if notes exceed max length
 */
export function validateNotes(notes: string | undefined): string | undefined {
    if (!notes || notes.trim() === '') return undefined;

    const sanitized = sanitizeInput(notes);

    if (sanitized.length > 500) {
        throw new Error('Notes exceed maximum length (500 characters)');
    }

    return sanitized;
}

/**
 * Validates a phone number (Philippine format)
 * 
 * @param phone - Phone number string
 * @returns true if valid PH mobile number
 */
export function isValidPhoneNumber(phone: string): boolean {
    // Philippine mobile format: 09XX-XXX-XXXX
    const phoneRegex = /^09\d{9}$/;
    return phoneRegex.test(phone.replace(/[-\s]/g, ''));
}

/**
 * Calculate number of nights between two dates
 * 
 * @param checkIn - Check-in date string (YYYY-MM-DD)
 * @param checkOut - Check-out date string (YYYY-MM-DD)
 * @returns Number of nights
 */
export function calculateNights(checkIn: string, checkOut: string): number {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

/**
 * Format date for display
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Formatted date string (e.g., "Feb 7, 2026")
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Validate that a date is not too far in the future
 * (e.g., prevent bookings more than 1 year ahead)
 * 
 * @param dateString - Date to validate
 * @param maxMonths - Maximum months in advance (default: 12)
 * @returns true if within allowed range
 */
export function isWithinBookingWindow(dateString: string, maxMonths: number = 12): boolean {
    const date = new Date(dateString);
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + maxMonths);
    return date <= maxDate;
}
