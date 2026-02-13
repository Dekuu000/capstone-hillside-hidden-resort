import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('ANCHOR_SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('ANCHOR_SERVICE_ROLE_KEY') ?? '';
const SEPOLIA_RPC_URL = Deno.env.get('SEPOLIA_RPC_URL') ?? '';
const ANCHOR_PRIVATE_KEY = Deno.env.get('ANCHOR_PRIVATE_KEY') ?? '';
const CHAIN_ID = Deno.env.get('CHAIN_ID') ?? '11155111';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CRITICAL_ACTIONS = new Set([
  'checkin',
  'checkout',
  'override_checkin',
  'cancel',
]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeHash(value: string) {
  return value.replace(/^0x/i, '').toLowerCase();
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    console.log('auth_debug: missing_token');
    return { error: 'Unauthorized', status: 401, stage: 'missing_token' };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    console.log('auth_debug: getUser_failed', userError?.message ?? 'no_user');
    return { error: 'Unauthorized', status: 401, stage: 'getUser_failed' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin') {
    console.log('auth_debug: role_check_failed', profileError?.message ?? 'not_admin');
    return { error: 'Admin access required', status: 403, stage: 'role_check_failed' };
  }

  return { userId: userData.user.id };
}

async function getActiveAnchor() {
  const { data } = await supabase
    .from('audit_anchors')
    .select('*')
    .in('status', ['pending', 'submitted'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

function isCritical(log: { action: string; entity_type: string; metadata?: any }) {
  if (CRITICAL_ACTIONS.has(log.action)) return true;
  if (log.entity_type === 'payment' && log.action === 'verify') return true;
  if (log.entity_type === 'reservation' && log.action === 'update' && log.metadata?.new_status === 'confirmed') {
    return true;
  }
  return false;
}

async function buildAnchorBatch() {
  const { data: lastAnyAnchor } = await supabase
    .from('audit_anchors')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAnyAnchor?.created_at) {
    const lastTime = new Date(lastAnyAnchor.created_at).getTime();
    if (Date.now() - lastTime < 30 * 1000) {
      return { message: 'Please wait before starting another anchor.' };
    }
  }

  const activeAnchor = await getActiveAnchor();
  if (activeAnchor) return { existing: activeAnchor };

  const { data: lastConfirmed } = await supabase
    .from('audit_anchors')
    .select('range_end')
    .eq('status', 'confirmed')
    .order('range_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = supabase
    .from('audit_logs')
    .select('audit_id, data_hash, timestamp, action, entity_type, metadata, anchor_id')
    .is('anchor_id', null)
    .order('timestamp', { ascending: true })
    .order('audit_id', { ascending: true });

  if (lastConfirmed?.range_end) {
    query = query.gt('timestamp', lastConfirmed.range_end);
  }

  const { data: logs, error } = await query;
  if (error) throw error;

  const filtered = (logs ?? []).filter(isCritical);
  if (filtered.length === 0) return { message: 'No new audit logs to anchor' };

  const hashes = filtered.map((log) => sanitizeHash(log.data_hash));
  for (const hash of hashes) {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid audit log hash');
  }

  const payload = hashes.join('\n');
  const rootHash = await sha256Hex(payload);

  const rangeStart = filtered[0].timestamp;
  const rangeEnd = filtered[filtered.length - 1].timestamp;
  const auditIds = filtered.map((log) => log.audit_id);

  const { data: anchorId, error: anchorError } = await supabase.rpc('create_audit_anchor_batch', {
    p_anchor_type: 'manual_batch',
    p_scope: 'critical_only',
    p_range_start: rangeStart,
    p_range_end: rangeEnd,
    p_log_count: filtered.length,
    p_root_hash: rootHash,
    p_chain_id: CHAIN_ID,
    p_audit_ids: auditIds,
  });

  if (anchorError) throw anchorError;

  return {
    anchor_id: anchorId as string,
    root_hash: rootHash,
    log_count: filtered.length,
    chain_id: CHAIN_ID,
  };
}

async function anchorExisting(anchorId: string) {
  const { data: anchor, error } = await supabase
    .from('audit_anchors')
    .select('*')
    .eq('anchor_id', anchorId)
    .maybeSingle();

  if (error || !anchor) throw error ?? new Error('Anchor not found');

  if (anchor.status === 'submitted' || anchor.status === 'confirmed') return anchor;

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL, Number(CHAIN_ID));
  const wallet = new ethers.Wallet(ANCHOR_PRIVATE_KEY, provider);
  const rootHash = sanitizeHash(anchor.root_hash);

  if (rootHash.length !== 64) throw new Error('Invalid root hash length');

  try {
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      data: `0x${rootHash}`,
    });

    const { error: updateError } = await supabase
      .from('audit_anchors')
      .update({
        tx_hash: tx.hash,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('anchor_id', anchorId);

    if (updateError) throw updateError;

    return { ...anchor, tx_hash: tx.hash, status: 'submitted' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Anchor submission failed';
    await supabase
      .from('audit_anchors')
      .update({ status: 'failed', error_message: message.slice(0, 300) })
      .eq('anchor_id', anchorId);
    throw err;
  }
}

async function confirmStatus(anchorId: string) {
  const { data: anchor, error } = await supabase
    .from('audit_anchors')
    .select('*')
    .eq('anchor_id', anchorId)
    .maybeSingle();

  if (error || !anchor) throw error ?? new Error('Anchor not found');
  if (!anchor.tx_hash) throw new Error('Anchor has no transaction hash');

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL, Number(CHAIN_ID));
  const receipt = await provider.getTransactionReceipt(anchor.tx_hash);

  if (receipt) {
    await supabase
      .from('audit_anchors')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('anchor_id', anchorId);
    return { ...anchor, status: 'confirmed' };
  }

  return anchor;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authCheck = await requireAdmin(req);
    if ('error' in authCheck) {
      return jsonResponse({ ok: false, error: authCheck.error, stage: authCheck.stage }, authCheck.status);
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode ?? 'build_and_anchor';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SEPOLIA_RPC_URL || !ANCHOR_PRIVATE_KEY) {
      return jsonResponse({ ok: false, error: 'Missing server configuration' }, 500);
    }

    if (mode === 'build_and_anchor') {
      const batch = await buildAnchorBatch();
      if ('message' in batch) return jsonResponse({ ok: true, message: batch.message });
      if ('existing' in batch) return jsonResponse({ ok: true, ...batch.existing });

      const anchored = await anchorExisting(batch.anchor_id);
      return jsonResponse({
        ok: true,
        anchor_id: batch.anchor_id,
        status: anchored.status,
        tx_hash: anchored.tx_hash ?? null,
        root_hash: batch.root_hash,
        log_count: batch.log_count,
        chain_id: batch.chain_id,
      });
    }

    if (mode === 'anchor_existing') {
      if (!body.anchor_id) return jsonResponse({ ok: false, error: 'anchor_id is required' }, 400);
      const anchored = await anchorExisting(body.anchor_id);
      return jsonResponse({
        ok: true,
        anchor_id: anchored.anchor_id,
        status: anchored.status,
        tx_hash: anchored.tx_hash ?? null,
        root_hash: anchored.root_hash,
        log_count: anchored.log_count,
        chain_id: anchored.chain_id,
      });
    }

    if (mode === 'confirm_status') {
      if (!body.anchor_id) return jsonResponse({ ok: false, error: 'anchor_id is required' }, 400);
      const anchored = await confirmStatus(body.anchor_id);
      return jsonResponse({
        ok: true,
        anchor_id: anchored.anchor_id,
        status: anchored.status,
        tx_hash: anchored.tx_hash ?? null,
        root_hash: anchored.root_hash,
        log_count: anchored.log_count,
        chain_id: anchored.chain_id,
      });
    }

    return jsonResponse({ ok: false, error: 'Invalid mode' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
