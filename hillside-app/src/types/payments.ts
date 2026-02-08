import type { Payment } from './database';

export interface PaymentWithReservation extends Payment {
    reservation?: {
        reservation_code: string;
        total_amount: number;
        deposit_required?: number;
        guest?: {
            name: string;
            email?: string;
        };
    };
}

export interface SubmitPaymentInput {
    reservationId: string;
    paymentType: 'deposit' | 'full';
    amount: number;
    method: 'gcash';
    referenceNo?: string;
    proofUrl?: string;
}

export interface VerifyPaymentInput {
    paymentId: string;
    approved: boolean;
}

export interface RecordOnSitePaymentInput {
    reservationId: string;
    amount: number;
    method: 'cash' | 'gcash' | 'bank' | 'card';
    referenceNo?: string;
}
