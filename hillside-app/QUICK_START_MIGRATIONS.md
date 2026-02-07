# Quick Start: Manual Migration Steps

## ⚠️ Important: Apply in this EXACT order!

The migrations have dependencies, so you MUST apply them in this sequence:

### Step 1: Create audit_logs table (006)
1. Open Supabase Dashboard → SQL Editor
2. Create new query
3. Copy **ALL** content from: `supabase/migrations/20260207_006_audit_logs.sql`
4. Click "Run" (or Ctrl+Enter)
5. ✅ Should see: "Success. No rows returned"

### Step 2: Create enhanced RLS policies (005)
1. In SQL Editor, create new query
2. Copy **ALL** content from: `supabase/migrations/20260207_005_enhanced_rls.sql`
3. Click "Run"
4. ✅ Should see: "Success. No rows returned"

### Step 3: Create atomic reservation function (004) 
1. In SQL Editor, create new query
2. Copy **ALL** content from: `supabase/migrations/20260207_004_atomic_reservation.sql`
3. Click "Run"
4. ✅ Should see: "Success. No rows returned"

---

## Verify Migrations Worked

Run this query to check everything is created:

```sql
-- Check all 3 components exist
SELECT 'audit_logs table' as component, COUNT(*)::text as exists
FROM information_schema.tables 
WHERE table_name = 'audit_logs'

UNION ALL

SELECT 'is_admin function', COUNT(*)::text
FROM information_schema.routines 
WHERE routine_name = 'is_admin'

UNION ALL

SELECT 'create_reservation_atomic function', COUNT(*)::text
FROM information_schema.routines 
WHERE routine_name = 'create_reservation_atomic';
```

**Expected output**: All three rows should show "1" in the exists column.

---

## If You Get Errors

### "relation audit_logs does not exist"
- **Cause**: You ran migration 004 or 005 before 006
- **Fix**: Run migration 006 first

### "function is_admin does not exist"  
- **Cause**: You ran migration 004 before 005
- **Fix**: Run migration 005 before 004

### "unrecognized RAISE statement option"
- **Cause**: Old version of the migration file
- **Fix**: Make sure you copied the LATEST version from the files (I just fixed this!)

---

## After All Migrations

Test with this query (replace `<your-user-id>` and `<unit-id>`):

```sql
SELECT * FROM create_reservation_atomic(
  p_guest_user_id := '<your-user-id>'::UUID,
  p_check_in := CURRENT_DATE + 1,
  p_check_out := CURRENT_DATE + 3,
  p_unit_ids := ARRAY['<unit-id>'::UUID],
  p_rates := ARRAY[1000.00],
  p_total_amount := 2000.00
);
```

**Expected**: Returns a row with reservation_id, reservation_code, status, message.

---

## Why This Order?

```
006 (audit_logs) 
  ↓
005 (is_admin + RLS)
  ↓  
004 (atomic function) ← uses both audit_logs AND is_admin()
```

Migration 004 needs:
- `audit_logs` table (from 006) to INSERT audit records
- `is_admin()` function (from 005) for RLS policies

That's why 006 and 005 must run first!
