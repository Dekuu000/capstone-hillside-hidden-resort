# Phase 7 Anchoring Spec (Sepolia)

This document defines how audit log hashes are anchored on-chain in Phase 7.

## Scope (Critical Actions Only)
We anchor only the following critical actions:
- reservation_confirm (mapped from audit_logs: action='update' + metadata.new_status='confirmed')
- payment_verify (mapped from audit_logs: entity_type='payment' + action='verify')
- checkin
- checkout
- override_checkin
- cancel

No PII is included on-chain.

## Batch Selection Rule
Anchor all eligible audit_logs with:
- anchor_id IS NULL
- action/entity match the critical scope above
- (optional) timestamp > last_confirmed_anchor.range_end

If no eligible logs exist, return “No new audit logs to anchor”.

## Deterministic Ordering
Order eligible logs by:
1) timestamp ASC
2) audit_id ASC

## Root Hash Computation (Deterministic)
Let H = [h1, h2, ..., hn] where each hi is:
- audit_logs.data_hash
- lowercase hex, no “0x” prefix

payload = join(H, "\n")
root_hash = sha256(payload) as lowercase hex (64 chars, no “0x”)

## On-Chain Encoding Rule
Use a normal transaction (no contract):
- tx.data = "0x" + root_hash
- chain: Ethereum Sepolia (chain_id = 11155111)

## Concurrency Guard
Do not allow multiple active anchors.
Block or return an existing anchor if status IN ('pending','submitted') within last 10 minutes.

## No PII Rule
Only data_hash values are used for the payload.
Do not include guest names, emails, phones, or any raw data.

## Environment Variables (Edge Function)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SEPOLIA_RPC_URL
- ANCHOR_PRIVATE_KEY
- CHAIN_ID=11155111

## Modes (Edge Function)
- build_and_anchor: build batch + submit tx
- anchor_existing: submit tx for existing pending/failed anchor
- confirm_status: fetch receipt + mark confirmed
