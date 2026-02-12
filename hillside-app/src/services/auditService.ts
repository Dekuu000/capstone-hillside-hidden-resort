import { supabase } from '../lib/supabase';
import type { AuditLog } from '../types/database';

export interface AuditLogFilters {
    action?: AuditLog['action'];
    entityType?: AuditLog['entity_type'];
    fromDate?: string;
    toDate?: string;
}

export interface AuditLogWithUser extends AuditLog {
    performed_by?: {
        name?: string | null;
        email?: string | null;
    } | null;
}

export async function fetchAuditLogs(filters: AuditLogFilters = {}) {
    let query = supabase
        .from('audit_logs')
        .select('*, performed_by:users!performed_by_user_id(name, email)')
        .order('timestamp', { ascending: false })
        .limit(200);

    if (filters.action) {
        query = query.eq('action', filters.action);
    }
    if (filters.entityType) {
        query = query.eq('entity_type', filters.entityType);
    }
    if (filters.fromDate) {
        query = query.gte('timestamp', filters.fromDate);
    }
    if (filters.toDate) {
        query = query.lte('timestamp', filters.toDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as AuditLogWithUser[];
}
