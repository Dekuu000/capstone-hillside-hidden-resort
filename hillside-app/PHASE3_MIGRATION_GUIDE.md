# Phase 3 Migration Guide

## Overview

This guide walks you through deploying the Phase 3 security enhancements for the Hillside Hidden Resort reservation system.

## What's Being Deployed

### Database Migrations (3 files)
1. `20260207_004_atomic_reservation.sql` - Atomic reservation creation with row locks
2. `20260207_005_enhanced_rls.sql` - Enhanced RLS policies
3. `20260207_006_audit_logs.sql` - Immutable audit trail

### Frontend Updates
1. `src/lib/validation.ts` - Input validation with Zod schemas
2. `src/lib/errors.ts` - Error handling and user-friendly messages
3. `src/features/reservations/useReservations.ts` - Updated to use atomic RPC

---

## Pre-Deployment Checklist

- [ ] **Backup database** via Supabase Dashboard → Settings → Database → Backups
- [ ] **Review all migration files** for any project-specific customizations
- [ ] **Verify development environment** is working
- [ ] **Plan deployment window** (recommended: off-peak hours)

---

## Deployment Steps

### Step 1: Apply Database Migrations

You have two options:

#### Option A: Supabase CLI (Recommended)

```bash
# Navigate to project directory
cd "c:\Users\user\Desktop\Capstone PWA(BeraChain)\hillside-app"

# Apply migrations
npx supabase db push

# Verify migrations applied
npx supabase db diff
```

#### Option B: Manual SQL Execution

1. Go to Supabase Dashboard → SQL Editor
2. Create a new query
3. Copy content from `supabase/migrations/20260207_004_atomic_reservation.sql`
4. Execute query
5. Verify success (should show "Success. No rows returned")
6. Repeat for migration 005 and 006

### Step 2: Verify Database Functions

Run these verification queries in Supabase SQL Editor:

```sql
-- Test 1: Verify atomic function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'create_reservation_atomic';
-- Expected: 1 row

-- Test 2: Verify helper function
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'is_admin';
-- Expected: 1 row

-- Test 3: Verify audit_logs table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'audit_logs';
-- Expected: 1 row

-- Test 4: Check RLS policies
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('reservations', 'reservation_units', 'audit_logs')
ORDER BY tablename, policyname;
-- Expected: Multiple policies for each table
```

### Step 3: Test Availability Function

Replace `<unit-id>` with an actual unit ID from your database:

```sql
-- Test availability check
SELECT check_unit_availability(
  '<unit-id>'::UUID,
  CURRENT_DATE + 1,
  CURRENT_DATE + 3,
  NULL
);
-- Expected: true or false (no errors)
```

### Step 4: Deploy Frontend Code

```bash
# Install dependencies (if new packages were added)
npm install

# Run development server to test locally
npm run dev

# Build for production
npm run build

# Test production build locally
npm run preview
```

### Step 5: Verify Frontend Integration

1. Open the app in browser: `http://localhost:5173`
2. Login as guest user
3. Navigate to booking page
4. Try to create a reservation (should use new atomic function)
5. Check browser console for errors
6. Verify validation messages appear for invalid inputs

---

## Post-Deployment Verification

### Functional Testing

Run through these scenarios:

#### Test 1: Create Valid Reservation

[]1. Login as guest
2. Go to /book
3. Select dates: tomorrow to +3 days
4. Select 1-2 units
5. Submit booking
6. **Expected**: Success message with reservation code
7. **Check**: Verify reservation appears in "My Bookings"

#### Test 2: Validation Errors

1. Try to book with check-out before check-in
   - **Expected**: Error message "Check-out date must be after check-in date"
2. Try to book more than 10 units
   - **Expected**: Error message "Maximum 10 units per reservation"
3. Try to book more than 30 nights
   - **Expected**: Error message "Maximum stay is 30 nights"

#### Test 3: Race Condition Prevention

This requires two browser windows/sessions:

1. Open two browsers (Chrome + Firefox) logged in as different guests
2. Both select the same unit for the same dates
3. Submit simultaneously (within 1-2 seconds)
4. **Expected**: One succeeds, one gets "Unit not available" error
5. **Verify**: Only 1 reservation created in database

```sql
-- Verify only 1 reservation
SELECT COUNT(*) FROM reservations 
WHERE check_in_date = '<test-date>' 
AND status != 'cancelled';
-- Expected: 1
```

#### Test 4: Authorization

1. Login as guest
2. Try to access `/admin/reservations` directly
   - **Expected**: Redirected to login or access denied
3. Open browser DevTools → Console
4. Try SQL injection in notes field: `'); DROP TABLE reservations;--`
   - **Expected**: Input sanitized, no SQL execution

#### Test 5: Audit Logs

1. Login as admin
2. Navigate to `/admin/audit` (if implemented)
3. **Expected**: See audit entries for reservation creation
4. Check database:

```sql
SELECT 
  a.timestamp,
  a.entity_type,
  a.action,
  u.name as performed_by,
  a.metadata
FROM audit_logs a
LEFT JOIN users u ON a.performed_by_user_id = u.user_id
ORDER BY a.timestamp DESC
LIMIT 10;
```

---

## Performance Verification

### Query Performance

Run these in Supabase SQL Editor:

```sql
-- Enable timing
\timing on

-- Test availability query (should be < 100ms)
EXPLAIN ANALYZE
SELECT * FROM get_available_units(
  CURRENT_DATE + 1,
  CURRENT_DATE + 7,
  NULL
);
-- Look for "Execution Time" in output

-- Test atomic creation (should be < 200ms)
-- Note: This will create a real reservation, use test data
EXPLAIN ANALYZE
SELECT * FROM create_reservation_atomic(
  '<guest-user-id>'::UUID,
  CURRENT_DATE + 5,
  CURRENT_DATE + 10,
  ARRAY['<unit-id>'::UUID],
  ARRAY[1000.00],
  1000.00,
  500.00,
  'Test reservation - delete me'
);
```

### Frontend Performance

1. Open browser DevTools → Network tab
2. Navigate to booking page
3. Submit reservation
4. Check network requests:
   - `create_reservation_atomic` call should complete in < 2 seconds
   - No excessive API calls (should be 1-2 max)

---

## Rollback Procedure

If critical issues occur:

### Database Rollback

1. Go to Supabase Dashboard → Settings → Database → Backups
2. Click "Restore" on the backup created before migration
3. Confirm restoration

### Frontend Rollback

```bash
# Revert to previous commit
git log --oneline -5  # Find previous commit
git revert HEAD  # Or specific commit hash
git push origin main
```

### Quick Fix Without Full Rollback

If only RLS policies are causing issues:

```sql
-- Temporarily disable RLS (DEVELOPMENT ONLY!)
ALTER TABLE reservations DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_units DISABLE ROW LEVEL SECURITY;

-- Fix the issue, then re-enable
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_units ENABLE ROW LEVEL SECURITY;
```

---

## Common Issues & Fixes

### Issue 1: "Function create_reservation_atomic does not exist"

**Cause**: Migration not applied or syntax error

**Fix**:
1. Check migration was executed successfully
2. Re-run migration 004
3. Check for errors in Supabase logs

### Issue 2: "Permission denied for function create_reservation_atomic"

**Cause**: Missing GRANT statement

**Fix**:
```sql
GRANT EXECUTE ON FUNCTION public.create_reservation_atomic TO authenticated;
```

### Issue 3: RLS blocks all operations

**Cause**: is_admin() function not working correctly

**Fix**:
```sql
-- Test is_admin function
SELECT public.is_admin();

-- Check user role
SELECT user_id, role FROM users WHERE user_id = auth.uid();

-- Temporarily allow all for testing
DROP POLICY IF EXISTS "admins_update_reservations" ON reservations;
CREATE POLICY "temp_allow_all" ON reservations FOR ALL USING (true);
```

### Issue 4: "Unit not available" but calendar shows empty

**Cause**: Conflicting reservation statuses

**Fix**:
```sql
-- Check for conflicting reservations
SELECT * FROM reservations r
JOIN reservation_units ru ON r.reservation_id = ru.reservation_id
WHERE ru.unit_id = '<unit-id>'
AND r.check_in_date <= '<end-date>'
AND r.check_out_date >= '<start-date>'
AND r.status NOT IN ('cancelled', 'no_show', 'checked_out');
```

---

## Monitoring After Deployment

### First 24 Hours

Monitor these metrics:

- [ ] Error rate (should be < 1%)
- [ ] Reservation creation success rate (should be > 99%)
- [ ] Page load times (should be < 2s)
- [ ] Database query times (check Supabase logs)

### Queries for Monitoring

```sql
-- Count reservations created today
SELECT COUNT(*) FROM reservations 
WHERE created_at >= CURRENT_DATE;

-- Check for errors in audit logs
SELECT * FROM audit_logs 
WHERE timestamp >= NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;

-- Performance: Slow queries
-- Check Supabase Dashboard → Database → Query Performance
```

---

## Success Criteria

✅ All migrations applied successfully  
✅ Functions and policies created  
✅ Frontend code deployed without errors  
✅ Can create reservations without errors  
✅ Validation working correctly  
✅ No double bookings in testing  
✅ Audit logs being created  
✅ Performance targets met (< 200ms)  

---

## Next Steps

After Phase 3 is stable:

1. **Phase 4**: Payment upload and verification
2. **Phase 5**: QR code generation and scanning
3. **Phase 6**: Reporting and analytics
4. **Phase 7**: Blockchain audit trail

---

## Support

If you encounter issues:

1. Check this migration guide first
2. Review error messages in browser console
3. Check Supabase logs for database errors
4. Review the implementation plan: `phase_3_implementation_plan.md`

**Remember**: Always test in development before deploying to production!
