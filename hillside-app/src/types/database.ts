export interface User {
    user_id: string;
    role: 'admin' | 'guest';
    name: string;
    phone?: string;
    email?: string;
    created_at: string;
}

export interface Unit {
    unit_id: string;
    name: string;
    type: 'room' | 'cottage' | 'amenity';
    description?: string;
    base_price: number;
    capacity: number;
    is_active: boolean;
    image_url?: string;
    amenities?: string[];
    created_at: string;
    updated_at: string;
}

export interface Reservation {
    reservation_id: string;
    reservation_code: string;
    guest_user_id: string;
    check_in_date: string;
    check_out_date: string;
    status: 'pending_payment' | 'for_verification' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
    total_amount: number;
    deposit_required?: number;
    amount_paid_verified?: number;
    balance_due?: number;
    hold_expires_at?: string;
    notes?: string;
    created_at: string;
    updated_at?: string;
}

export interface ReservationUnit {
    reservation_unit_id: string;
    reservation_id: string;
    unit_id: string;
    rate_snapshot: number;
    quantity_or_nights: number;
}

export interface Payment {
    payment_id: string;
    reservation_id: string;
    payment_type: 'deposit' | 'full' | 'on_site' | 'refund';
    method: 'gcash' | 'bank' | 'cash' | 'card';
    amount: number;
    reference_no?: string;
    proof_url?: string;
    status: 'pending' | 'verified' | 'rejected';
    verified_by_admin_id?: string;
    verified_at?: string;
    created_at: string;
}

export interface CheckinLog {
    checkin_log_id: string;
    reservation_id: string;
    scanned_by_admin_id: string;
    checkin_time?: string;
    checkout_time?: string;
    remarks?: string;
}

export interface AuditLog {
    audit_id: string;
    performed_by_user_id?: string;
    entity_type: 'reservation' | 'payment' | 'checkin' | 'unit';
    entity_id: string;
    action: 'create' | 'update' | 'verify' | 'cancel' | 'checkin' | 'checkout' | 'reject' | 'refund' | 'record_on_site' | 'change_unit' | 'update_dates' | 'update_status';
    data_hash: string;
    blockchain_tx_hash?: string;
    timestamp: string;
}

// Database helper types
export type Database = {
    public: {
        Tables: {
            users: {
                Row: User;
                Insert: Omit<User, 'user_id' | 'created_at'>;
                Update: Partial<Omit<User, 'user_id'>>;
            };
            units: {
                Row: Unit;
                Insert: Omit<Unit, 'unit_id' | 'created_at'>;
                Update: Partial<Omit<Unit, 'unit_id'>>;
            };
            reservations: {
                Row: Reservation;
                Insert: Omit<Reservation, 'reservation_id' | 'created_at'>;
                Update: Partial<Omit<Reservation, 'reservation_id'>>;
            };
            reservation_units: {
                Row: ReservationUnit;
                Insert: Omit<ReservationUnit, 'reservation_unit_id'>;
                Update: Partial<Omit<ReservationUnit, 'reservation_unit_id'>>;
            };
            payments: {
                Row: Payment;
                Insert: Omit<Payment, 'payment_id' | 'created_at'>;
                Update: Partial<Omit<Payment, 'payment_id'>>;
            };
            checkin_logs: {
                Row: CheckinLog;
                Insert: Omit<CheckinLog, 'checkin_log_id'>;
                Update: Partial<Omit<CheckinLog, 'checkin_log_id'>>;
            };
            audit_logs: {
                Row: AuditLog;
                Insert: Omit<AuditLog, 'audit_id' | 'timestamp'>;
                Update: Partial<Omit<AuditLog, 'audit_id'>>;
            };
        };
    };
};
