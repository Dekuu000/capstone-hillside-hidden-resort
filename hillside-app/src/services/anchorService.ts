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

async function getAuthHeaders() {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    const headers: Record<string, string> = {};
    if (apiKey) headers.apikey = apiKey;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
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
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('anchor-audit', {
        body: { mode: 'build_and_anchor' },
        headers,
    });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data.error || 'Anchor failed');
    return data as AnchorResponse;
}

export async function anchorExisting(anchorId: string) {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('anchor-audit', {
        body: { mode: 'anchor_existing', anchor_id: anchorId },
        headers,
    });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data.error || 'Anchor failed');
    return data as AnchorResponse;
}

export async function confirmAnchorStatus(anchorId: string) {
    const headers = await getAuthHeaders();
    const { data, error } = await supabase.functions.invoke('anchor-audit', {
        body: { mode: 'confirm_status', anchor_id: anchorId },
        headers,
    });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data.error || 'Confirm failed');
    return data as AnchorResponse;
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
