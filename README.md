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

3. In the Supabase SQL Editor, apply migration files in filename order. For a new database, apply every file in `supabase/migrations`. For an existing database, apply only migrations that have not already been applied; do not rerun `001`. In particular, `003_auth_collaboration.sql` creates `public.profiles`; `004_account_roles.sql` adds the system role and Superadmin access rules. If `public.profiles` does not exist, apply migration 003 before migration 004. Migration 008 fixes audit logging. The latest account-management migration replaces broad member-management policies with role-scoped rules and makes all newly registered Auth users ordinary users by default.
4. Create the initial Auth user in **Authentication → Users** or sign up, then promote that profile explicitly in SQL Editor:

   ```sql
   insert into public.profiles (id, full_name, email)
   select id,
          coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
          email
   from auth.users
   where email is not null
   on conflict (id) do nothing;

   update public.profiles
   set system_role = 'superadmin'
   where lower(email) = lower('admin@example.com');
   ```

   New users always receive the `user` system role. Signing in alone never grants Superadmin access. The Programs navigation, Settings → Database, and system-wide create controls are shown only when the signed-in user's `public.profiles.system_role` is `superadmin`. Program account management is available in each program's Settings.

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

Fiscal-year funding is stored as separate `program_annual_allocations` records, keyed by program, fiscal year, and fund source. The finance page tracks the allocated budget/appropriation, allotment received and SARO/NCA references, obligations and ORS/BURS references, disbursements and DV/ADA references, accounts payable, cash advances, liquidation, and savings. It derives unobligated allotment and unpaid obligations.

Supplier/purchase packages are stored as separate `activity_procurement_items` rows. An activity can therefore have different suppliers for food and catering, venue and lodging, transport, farm inputs, equipment, and other goods or services.

`supabase/seed_demo_data.sql` is an optional, rerunnable seed for demonstrating all application tables. It creates the sample AMIA/4K program rows and baseline workflows only when they are missing; it leaves existing program details and customized workflows untouched. It also adds clearly labeled fictional activities, applications, annual financial allocations, suppliers, timeline history, comments, and audit examples. The seed only assigns program memberships to real existing Auth users; it never creates Auth accounts or passwords. For the optional AMIA program-admin / 4K viewer membership, create that person as a real Supabase Auth user first and replace the example email in the seed. Run the seed from the Supabase SQL Editor only in a non-production project, after all seven migrations and after creating the real Auth users. Do not run demo data in production.

## Development

```powershell
npm install
npm run dev
npm run build
npm run lint
```

Authentication and database access use Supabase Auth and Row Level Security. The client uses only the public anon/publishable key; database policies enforce each user's program access.
