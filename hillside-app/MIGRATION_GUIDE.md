# Phase 1: Database Migration Instructions

## Running the Migration in Supabase

You have two options to run the SQL migration:

### Option 1: Supabase Dashboard (Recommended for Development)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (in the left sidebar)
3. Click **New query**
4. Copy the contents of `supabase/migrations/20260205_001_create_users_table.sql`
5. Paste into the SQL editor
6. Click **Run** (or press Ctrl+Enter)

### Option 2: Supabase CLI (For Production/Team Workflow)

```bash
# Install Supabase CLI (if not already installed)
npm install -D supabase

# Initialize Supabase (if not already done)
npx supabase init

# Link to your project
npx supabase link --project-ref YOUR_PROJECT_ID

# Push migration to Supabase
npx supabase db push
```

---

## Verifying the Migration

After running the migration, verify in the Supabase Dashboard:

1. Go to **Table Editor**
2. You should see the `users` table with columns:
   - `user_id` (UUID, primary key)
   - `role` (TEXT, CHECK constraint)
   - `name` (TEXT)
   - `phone` (TEXT, nullable)
   - `email` (TEXT, nullable)
   - `created_at` (TIMESTAMPTZ)

3. Go to **Authentication** > **Policies**
4. You should see RLS policies for the `users` table:
   - `users_read_own`
   - `users_update_own`
   - `admins_read_all`
   - `authenticated_insert`

---

## Creating a Test Admin User

Since the first user will be a guest by default, you need to manually create an admin user:

### Method 1: Via Supabase Dashboard

1. Go to **SQL Editor**
2. Run this query (replace with your email):

```sql
-- First, sign up through the app to create the auth.users entry
-- Then run this to upgrade your role to admin:

UPDATE public.users
SET role = 'admin'
WHERE email = 'your-email@example.com';
```

### Method 2: Sign up with metadata

When registering through the app, you can temporarily modify the `RegisterPage.tsx` to pass `role: 'admin'` in the metadata (then revert after creating your admin account).

---

## Next Steps

Once the migration is complete:

1. ✅ Test registration flow (creates guest user)
2. ✅ Upgrade one user to admin via SQL
3. ✅ Test login with admin → should see Admin Dashboard
4. ✅ Test login with guest → should see Guest Dashboard
5. ✅ Verify protected routes work correctly
