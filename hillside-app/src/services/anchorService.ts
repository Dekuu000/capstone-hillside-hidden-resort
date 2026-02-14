import { supabase } from '../lib/supabase';
import type { AuditAnchor, AuditLog } from '../types/database';

export interface AnchorResponse {
    ok: boolean;
    message?: string;
    anchor_id?: string;
    status?: AuditAnchor['status'];
    tx_hash?: string | null;
    root_hash?: string;
    log_count?: number;
    chain_id?: string;
}

async function invokeAnchorFunction(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('anchor-audit', { body });
    if (error) {
        console.error('anchor-audit invoke error', {
            status: error.status,
            message: error.message,
            details: error.details,
        });
        throw new Error(`[${error.status ?? 'error'}] ${error.message}`);
    }
    if (data?.ok === false) {
        console.error('anchor-audit non-ok response', data);
        throw new Error(`[${data.status ?? 'error'}] ${data.error ?? 'Anchor failed'}`);
    }
    return data as AnchorResponse;
}

export async function fetchLatestAnchor() {
    const { data, error } = await supabase
        .from('audit_anchors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data as AuditAnchor | null;
}

export async function fetchLatestConfirmedAnchor() {
    const { data, error } = await supabase
        .from('audit_anchors')
        .select('*')
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data as AuditAnchor | null;
}

export async function anchorAuditNow() {
    return invokeAnchorFunction({ mode: 'build_and_anchor' });
}

export async function anchorExisting(anchorId: string) {
    return invokeAnchorFunction({ mode: 'anchor_existing', anchor_id: anchorId });
}

export async function confirmAnchorStatus(anchorId: string) {
    return invokeAnchorFunction({ mode: 'confirm_status', anchor_id: anchorId });
}

export async function fetchAuditHashesForAnchor(anchorId: string) {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('audit_id, data_hash, timestamp')
        .eq('anchor_id', anchorId)
        .order('timestamp', { ascending: true })
        .order('audit_id', { ascending: true });

    if (error) throw error;
    return data as Pick<AuditLog, 'audit_id' | 'data_hash' | 'timestamp'>[];
}
