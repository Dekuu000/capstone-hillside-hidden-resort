# Admin Payment Verification Guide

Purpose: Provide a consistent, secure process for verifying guest payment proofs (GCash) and updating reservation status.

## Where to Verify
Primary:
- Admin Payments list: `/admin/payments`
- Reservation details: `/admin/reservations/:id`

## What the Admin Should Check
Required fields (from guest submission):
- Reference number (GCash reference)
- Proof image/PDF (uploaded screenshot/receipt)
- Amount paid
- Payment type (Deposit or Full)

System context to cross-check:
- Reservation total_amount
- Minimum deposit_required
- Existing verified payments
- Status (should be `for_verification` when proof is submitted)

## Step-by-Step Verification (Recommended)
1. Open the payment record in the admin Payments list.
2. Compare the submitted amount with reservation rules:
   - Deposit: must be >= minimum deposit_required
   - Full: must equal total_amount
3. Click the proof file to view (signed URL from Supabase Storage).
4. Verify the reference number and amount match the proof.
5. Mark payment as:
   - Verified: if proof is valid and amounts match
   - Rejected: if proof is invalid, wrong amount, or mismatched reference
6. System updates:
   - If verified payments >= required minimum, reservation can be confirmed.
   - Remaining balance is collected on-site and recorded as on_site payment.

## Evidence Checklist (GCash)
- Reference number present and matches the receipt
- Amount matches the expected pay_now
- Date/time matches booking timeline
- Recipient account matches the resort’s GCash account
- Screenshot is clear and readable

## Notes / Edge Cases
- If guest paid more than minimum deposit, verify the exact amount submitted.
- If proof is missing or unreadable, reject and request resubmission.
- If multiple payments exist, verify each in sequence before confirming.
- Do not confirm when only partial/invalid payment is verified.

## Security & Data Handling
- Proof files are stored in a private Supabase Storage bucket.
- Always access proof files using signed URLs (no public links).
- Never share proof screenshots outside the admin tools.
