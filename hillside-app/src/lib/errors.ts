/**
 * Error Handling Module
 * 
 * Custom error classes and handlers for converting database/API errors
 * into user-friendly messages.
 */

// ====================
// Custom Error Classes
// ====================

/**
 * Custom error class for reservation-related errors
 */
export class ReservationError extends Error {
    code: string;
    statusCode: number;
    userMessage?: string;

    constructor(
        message: string,
        code: string,
        statusCode: number = 400,
        userMessage?: string
    ) {
        super(message);
        this.name = 'ReservationError';
        this.code = code;
        this.statusCode = statusCode;
        this.userMessage = userMessage;

        // Maintains proper stack trace for where error was thrown (V8 only)
        if (typeof (Error as any).captureStackTrace === 'function') {
            (Error as any).captureStackTrace(this, this.constructor);
        }
    }
}

// ====================
// Error Codes
// ====================

/**
 * Standard error codes for the application
 */
export const ErrorCodes = {
    // Availability errors
    UNIT_NOT_AVAILABLE: 'UNIT_NOT_AVAILABLE',
    SYSTEM_BUSY: 'SYSTEM_BUSY',

    // Validation errors
    INVALID_DATES: 'INVALID_DATES',
    INVALID_INPUT: 'INVALID_INPUT',

    // Not found errors
    RESERVATION_NOT_FOUND: 'RESERVATION_NOT_FOUND',
    UNIT_NOT_FOUND: 'UNIT_NOT_FOUND',

    // Authorization errors
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',

    // Payment errors
    PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',

    // System errors
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// ====================
// Supabase Error Handler
// ====================

/**
 * Converts Supabase/PostgreSQL errors to user-friendly ReservationError
 * 
 * @param error - Original error from Supabase
 * @throws ReservationError with appropriate message and code
 */
export function handleSupabaseError(error: any): never {
    // Log the original error for debugging
    console.error('Supabase error:', error);

    // PostgreSQL error codes
    // See: https://www.postgresql.org/docs/current/errcodes-appendix.html

    // 23505: unique_violation (duplicate key)
    if (error.code === '23505') {
        throw new ReservationError(
            'Duplicate entry',
            ErrorCodes.SYSTEM_ERROR,
            409,
            'This reservation code already exists. Please try again.'
        );
    }

    // 23503: foreign_key_violation (referenced record doesn't exist)
    if (error.code === '23503') {
        throw new ReservationError(
            'Invalid reference',
            ErrorCodes.UNIT_NOT_FOUND,
            400,
            'Selected unit(s) not found. Please refresh the page and try again.'
        );
    }

    // 23514: check_violation (check constraint failed)
    if (error.code === '23514') {
        throw new ReservationError(
            'Validation failed',
            ErrorCodes.INVALID_INPUT,
            400,
            'Invalid data submitted. Please check your input and try again.'
        );
    }

    // PGRST116: Row Level Security violation
    if (error.code === 'PGRST116' || error.message?.includes('new row violates')) {
        throw new ReservationError(
            'Unauthorized',
            ErrorCodes.UNAUTHORIZED,
            403,
            'You do not have permission to perform this action.'
        );
    }

    // PGRST301: Not found
    if (error.code === 'PGRST301' || error.status === 404) {
        throw new ReservationError(
            'Not found',
            ErrorCodes.RESERVATION_NOT_FOUND,
            404,
            'Reservation not found. It may have been cancelled or deleted.'
        );
    }

    // Custom application errors from stored procedures

    // Unit not available
    if (error.message?.includes('not available') || error.message?.includes('already booked')) {
        throw new ReservationError(
            error.message,
            ErrorCodes.UNIT_NOT_AVAILABLE,
            409,
            'Selected unit(s) are not available for these dates. Please choose different dates or units.'
        );
    }

    // System busy (lock_not_available)
    if (error.message?.includes('System busy') || error.message?.includes('lock_not_available')) {
        throw new ReservationError(
            error.message,
            ErrorCodes.SYSTEM_BUSY,
            503,
            'System is busy. Please wait a moment and try again.'
        );
    }

    // Invalid dates
    if (error.message?.includes('Invalid dates') || error.message?.includes('check-out must be after check-in')) {
        throw new ReservationError(
            error.message,
            ErrorCodes.INVALID_DATES,
            400,
            error.message
        );
    }

    // Maximum stay/units exceeded
    if (error.message?.includes('Maximum') || error.message?.includes('exceed')) {
        throw new ReservationError(
            error.message,
            ErrorCodes.INVALID_INPUT,
            400,
            error.message
        );
    }

    // No units selected
    if (error.message?.includes('No units selected')) {
        throw new ReservationError(
            error.message,
            ErrorCodes.INVALID_INPUT,
            400,
            'Please select at least one unit to continue.'
        );
    }

    // Network errors
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
        throw new ReservationError(
            error.message,
            ErrorCodes.NETWORK_ERROR,
            0,
            'Network error. Please check your internet connection and try again.'
        );
    }

    // Generic error fallback
    throw new ReservationError(
        error.message || 'Unknown error occurred',
        ErrorCodes.SYSTEM_ERROR,
        500,
        'An unexpected error occurred. Please try again or contact support if the problem persists.'
    );
}
