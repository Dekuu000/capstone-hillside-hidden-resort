# Blockchain Anchoring (Simple Explanation)

This page explains what **Anchor now**, **Confirm status**, and **Verify (DB)** do in Phase 7.
It is written in simple terms so anyone can understand.

## 1) What is “anchoring” in plain words?

Think of our audit logs like a notebook of important events:
- payment verified
- check‑in
- check‑out
- cancellation
- override check‑in

**Anchoring** means we take a **fingerprint** of those important log entries and store that fingerprint on a public blockchain.

Why?
- If someone changes a log later, the fingerprint will not match.
- That makes the system **tamper‑evident** (you can prove if data was changed).

Important: **We do NOT store guest names or personal data on the blockchain.**
Only a short hash (fingerprint) is stored.

## 2) What gets anchored (and why some rows are “Unanchored”)

We only anchor **critical actions** for privacy and performance:
- `reservation_confirm`
- `payment_verify`
- `checkin`
- `checkout`
- `override_checkin`
- `cancel`

Other actions like:
- `create reservation`
- `create payment`
- some `update` rows

…are **intentionally left unanchored**. That’s why you still see “Unanchored” rows in the list.
This is **expected behavior**, not a bug.

## 3) What does “Anchor now” do?

When you click **Anchor now**:
1. The system collects all **eligible, unanchored critical logs**.
2. It builds a single list of their hashes (no names or PII).
3. It computes one **root hash** (a final fingerprint).
4. It sends that root hash to the blockchain (Sepolia).
5. It saves a record in the database (audit_anchors) with:
   - root hash
   - count of logs
   - time range
   - tx hash
   - status

Result: those logs are now marked **Anchored** in the UI.

## 4) What does “Confirm status” do?

Blockchain transactions are not instant.
“Confirm status” checks whether your transaction is **mined** (confirmed) on Sepolia.

- If mined → status becomes **confirmed**.
- If still pending → status stays **submitted**.

This step is separate so the app does not freeze while waiting.

## 5) What does “Verify (DB)” do?

This is a local proof check:
1. The app re‑builds the hash from the same logs in the database.
2. It compares it to the stored root hash.
3. If they match → “Verified (DB) ✅”

This proves the database logs still match the anchored fingerprint.

## 6) How does this become “blockchain”? (simple view)

- The blockchain is a public ledger that is **very hard to change**.
- By writing our root hash into a blockchain transaction, we create a **public timestamped proof**.
- Later, we can prove: “These logs existed before this block, and were not changed.”

So the blockchain doesn’t store the logs — it stores the **proof** that the logs are real.

## 7) Quick example (easy version)

Imagine you have 3 important logs:
- A
- B
- C

We create a fingerprint from A, B, C and save that fingerprint on the blockchain.

If someone later changes B, the fingerprint becomes different.
Now you can detect tampering.

## 8) Common questions

**Q: Why do I still see Unanchored logs?**
A: Because we only anchor critical actions. Others are intentionally skipped.

**Q: Is guest data on-chain?**
A: No. Only hashes (fingerprints). No names, no emails, no phone numbers.

**Q: Do I need to anchor after every action?**
A: No. You can anchor in batches whenever you want (manual “Anchor now”).

## 9) Summary

- **Anchor now** = create a batch fingerprint + send to blockchain
- **Confirm status** = check if the blockchain mined the tx
- **Verify (DB)** = re‑compute hash and confirm database matches
- **Unanchored rows are normal** if they’re not in the critical list

If you want to change what gets anchored, we can adjust the critical actions list.
