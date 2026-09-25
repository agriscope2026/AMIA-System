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

Run migrations `001_program_workflows.sql`, `002_activity_step_remarks.sql`, and `003_auth_collaboration.sql` in order. Deploy the invitation function with the Supabase CLI:

```bash
supabase functions deploy invite-program-user
```

Create the first user in Supabase Authentication, then make that user an admin for a program from the SQL editor. Replace the email and program acronym as needed:

```sql
insert into public.program_members (program_id, user_id, role)
select p.id, u.id, 'admin'
from public.programs p
cross join auth.users u
where p.acronym = 'AMIA' and u.email = 'admin@example.com'
on conflict (program_id, user_id) do update set role = 'admin';
```

Admins can invite `Editor` and `Viewer` users from **Settings > Users & organizations**. Editors can update existing workflow steps, activity position, remarks, and threaded comments. Viewers can read programs and activities. All database writes are protected by Supabase row-level security, and changes to programs, workflow steps, activities, and comments are recorded in `audit_logs` for program admins.
