# DA-RFO-CAR Program & Workflow Management System

## Run locally

```bash
npm install
npm run dev
```

Without Supabase environment variables, the interface runs with local fallback data and saves edits in browser storage so refreshes do not reset the current draft. This local mode is for development only; use Supabase for shared, server-backed data.

## Connect Supabase

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Run `supabase/migrations/001_program_workflows.sql` in the Supabase SQL editor.
4. Start the app with `npm run dev`.

When configured, programs, workflow steps, sub-steps, and activities load from Supabase. Edits, new workflow steps, activity creation, activity updates, and deletes are persisted to the database.

Supabase provides both the PostgreSQL database and the API server for this application. Create a Supabase project, copy its project URL and anon key into `.env.local`, then run the migration. Do not commit `.env.local` or expose the service-role key in the browser.

## Authentication, users, comments, and audit history

Run migrations `001_program_workflows.sql`, `002_activity_step_remarks.sql`, `003_auth_collaboration.sql`, and `004_account_roles.sql` in order. Deploy the account function with the Supabase CLI:

```bash
supabase functions deploy create-managed-user
```

On a fresh database, the first account created from the app's **Create an account** page is automatically assigned `superadmin`. On an existing database, create a user in Supabase Authentication and promote it manually:

```sql
update public.profiles
set system_role = 'superadmin'
from auth.users u
where profiles.id = u.id and u.email = 'admin@example.com';
```

Users can create ordinary accounts from the login page. Superadmins can create `Superadmin`, `Program admin`, and `Viewer` accounts. Program admins can create `Viewer` accounts for their selected program. Program admins can customize their programs and activities; viewers can read and comment. All database writes are protected by Supabase row-level security, and changes to programs, workflow steps, activities, and comments are recorded in `audit_logs`.
