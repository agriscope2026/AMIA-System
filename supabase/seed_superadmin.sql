-- Promote one existing Supabase Auth user to Superadmin.
-- Replace the email below before running this script in the Supabase SQL Editor.
-- This does not create an Auth user or set/change a password.

begin;

do $$
declare
  target_email constant text := 'REPLACE_WITH_AUTH_EMAIL';
  target_user record;
begin
  if target_email is null or btrim(target_email) = '' then
    raise exception 'Set target_email to the exact email of an existing Auth user before running this script.';
  end if;

  select id, email, raw_user_meta_data ->> 'full_name' as full_name
  into strict target_user
  from auth.users
  where lower(email) = lower(target_email);

  insert into public.profiles (id, full_name, email, system_role)
  values (
    target_user.id,
    coalesce(nullif(btrim(target_user.full_name), ''), split_part(target_user.email, '@', 1)),
    target_user.email,
    'superadmin'
  )
  on conflict (id) do update
  set email = excluded.email,
      system_role = 'superadmin',
      updated_at = now();
end;
$$;

select id, full_name, email, system_role
from public.profiles
where lower(email) = lower('REPLACE_WITH_AUTH_EMAIL');

commit;
