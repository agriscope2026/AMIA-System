# DA-RFO-CAR Program & Workflow Management System

## Supabase setup

The application requires its hosted Supabase database. It does not use localStorage or built-in demo program/activity records. When the Supabase environment variables are missing, it displays setup instructions instead of accepting edits that would not reach the shared database.

1. Create a Supabase project and open **Project Settings → API**.
2. Copy `.env.example` to `.env.local` and set the project URL and public anon/publishable key:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

   If Supabase provides a publishable key instead of the legacy anon key, set `VITE_SUPABASE_PUBLISHABLE_KEY` and leave `VITE_SUPABASE_ANON_KEY` empty. For compatibility, this Vite app also accepts `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Use only a public client key, never a service-role key.

3. In the Supabase SQL Editor, apply migration files in filename order. For a new database, apply every file in `supabase/migrations`. For an existing database, apply only migrations that have not already been applied; do not rerun older migrations. In particular, `003_auth_collaboration.sql` creates `public.profiles`; `004_account_roles.sql` adds the system role and Superadmin access rules. If `public.profiles` does not exist, apply migration 003 before migration 004. Migration 008 fixes audit logging. The latest account-management migration replaces broad member-management policies with role-scoped rules and makes all newly registered Auth users ordinary users by default. Apply [`20260929024105_app_activity_calendar.sql`](./supabase/migrations/20260929024105_app_activity_calendar.sql) after the annual APP schema migration; it links APP rows to activities and supports unscheduled activities. Apply [`20260929031123_beneficiary_register.sql`](./supabase/migrations/20260929031123_beneficiary_register.sql) for the RLS-protected beneficiary register, then [`20260929034640_calendar_day_notes.sql`](./supabase/migrations/20260929034640_calendar_day_notes.sql) to enable shared day notes.
4. Create the initial Auth user in **Authentication → Users** or sign up, then open [`supabase/seed_superadmin.sql`](./supabase/seed_superadmin.sql), replace `REPLACE_WITH_AUTH_EMAIL` with that user's exact email, and run the script in SQL Editor. It promotes only that existing account, creates or updates its `public.profiles` row, and displays the resulting role. It is safe to rerun for the same email. It does not create an Auth user or set a password.

   New users always receive the `user` system role. Signing in alone never grants Superadmin access. The dashboard program selector, Settings → Programs, Settings → Database, and system-wide create controls are shown only when the signed-in user's `public.profiles.system_role` is `superadmin`. Program account management is available in each program's Settings.

5. Account creation, profile edits, and program access removal use Supabase Auth and RLS directly; they do not require deploying Edge Functions, a Vercel Pro plan, or a service-role key in the app. Enable email/password signups in **Authentication → Sign In / Providers**. This means anyone can create an Auth account through Supabase's public signup API; users receive no program access until an authorized admin assigns them, and RLS continues to block users without a program membership. Leave email confirmation enabled as appropriate; when enabled, newly created users must verify their email before signing in. Superadmins can assign program-admin or viewer roles; program admins can create, edit, and remove viewers only. Removing a member revokes access to that program, but does not delete their Supabase Auth account. Auth-user deletion still requires an authorized Supabase Dashboard operator or a privileged server-side function.

6. Restart the development server after changing `.env.local`:

   ```powershell
   npm install
   npm run dev
   ```

Never place the Supabase service-role key or user passwords in frontend code, `.env.example`, or a committed file. `.env.local` is excluded from Git.

## Vercel deployment

In the Vercel project, open **Settings → Environment Variables** and add:

- `VITE_SUPABASE_URL` — the Supabase project URL.
- One public client key: `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`.

Apply the variables to the deployment environments you use, then redeploy so Vite embeds them in the new client build. Accepting or installing a Supabase extension alone does not set these Vite variables in this application's code. Never add the `service_role` key to Vercel client/build variables.

## Finance and procurement

Fiscal-year funding is stored as separate `program_annual_allocations` records, keyed by program, fiscal year, and fund source. The finance page displays the allocated budget/appropriation, allotment received, disbursements, accounts payable, cash advances, liquidation, and savings. Detailed allocation editing is behind **Edit annual financial details** and uses per-fund forms; calculated values such as obligations are not editable there. Editing is limited to that program's program admin; Superadmins can view financial details but cannot edit them. Obligations are calculated from activity obligations (`program_activities.recorded_spending`) in the selected fiscal year, using the activity date or its linked APP fiscal year when it has no schedule yet.

Each fiscal year has separate APP, WFP, and PPMP worksheet tabs. The APP sheet mirrors the supplied 12 project columns, including procurement mode, early procurement activity, evaluation criteria, timeline, funding, estimated budget, strategy, and remarks. Compact column headings show the full title on hover. APP projects can be exported to or imported from CSV; imports append validated rows and keep existing projects. APP planned procurement totals are available as a separate dashboard metric and are not added to appropriations. WFP and PPMP tabs are reserved for their templates. Apply [`20260929011417_annual_procurement_plan_sheets.sql`](./supabase/migrations/20260929011417_annual_procurement_plan_sheets.sql) before using the APP sheet; program members and Superadmins can read it, while only the program admin can write it.

Saving an APP project creates or updates its linked activity in the same database transaction. The APP project title is the activity title, the estimated budget is the approved activity budget, and the APP procurement start/end months populate the activity dates used by the Calendar page. Activities without APP dates are still created and appear under **Unscheduled activities** in Calendar. APP-linked activity details are changed in the APP sheet; their workflow and design continue to be managed from the Activities page. Removing an APP row keeps its activity history, and an APP-linked activity cannot be deleted directly from Activities.

## Activity calendar

The Calendar uses a compact month grid with colors for activity statuses. Program admins can edit APP-linked schedule months from a day dialog; other program editors can edit non-APP activity dates. Day notes are shared with program members, and program admins/editors can add or change them. Apply the calendar day-notes migration before using notes.

`supabase/seed_demo_data.sql` is an optional, rerunnable APP-first seed for a non-production database. It inserts fictional annual allocations and APP projects; the migration's trigger creates the matching activities and links them to their APP rows. It does not delete records, create Auth users, or grant memberships. Existing rows created by an older version of the demo seed are left untouched. Do not run demo data in production.

If workflow steps were removed from the AMIA or 4K programs, run [`supabase/seed_default_workflow.sql`](./supabase/seed_default_workflow.sql) in the SQL Editor after migrations. It restores missing default steps only, preserves existing or customized steps, and does not create programs, users, or memberships.

## Beneficiary register

The Beneficiaries page stores a beneficiary name or code, optional linked activity, municipality, barangay, and assistance received. Avoid entering government ID numbers or personal contact details. Superadmins can view all programs; program admins and editors can add, edit, and delete records in their program; viewers have read-only access. Apply the beneficiary register migration before using this page.

For manual SQL Editor setup, paste and run the contents of each unapplied migration file once, in filename order. On an existing project, do not rerun migrations already applied; in particular, apply the APP activity/calendar migration only after the annual procurement sheet migration, and apply the calendar day-notes migration before using day notes. The repository does not apply these migrations to the hosted Supabase project automatically.

## Development

```powershell
npm install
npm run dev
npm run build
npm run lint
```

Authentication and database access use Supabase Auth and Row Level Security. The client uses only the public anon/publishable key; database policies enforce each user's program access.
