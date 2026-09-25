alter table public.profiles
  add column if not exists system_role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_system_role_check;
alter table public.profiles
  add constraint profiles_system_role_check check (system_role in ('superadmin', 'user'));

alter table public.program_members
  drop constraint if exists program_members_role_check;
alter table public.program_members
  add constraint program_members_role_check check (role in ('program_admin', 'editor', 'viewer'));

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and system_role = 'superadmin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email, system_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when not exists (select 1 from public.profiles) then 'superadmin' else 'user' end
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.is_program_member(target_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or exists (select 1 from public.program_members where program_id = target_program_id and user_id = auth.uid());
$$;

create or replace function public.can_manage_program_users(target_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or public.program_role(target_program_id) = 'program_admin';
$$;

create or replace function public.can_edit_program(target_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or public.program_role(target_program_id) in ('program_admin', 'editor');
$$;

drop policy if exists members_read_self_or_admin on public.program_members;
create policy members_read_self_or_admin on public.program_members for select to authenticated
  using (user_id = auth.uid() or public.can_manage_program_users(program_id));

drop policy if exists members_admin_manage on public.program_members;
create policy members_admin_manage on public.program_members for all to authenticated
  using (public.can_manage_program_users(program_id))
  with check (public.can_manage_program_users(program_id));

drop policy if exists programs_admin_update on public.programs;
create policy programs_superadmin_insert on public.programs for insert to authenticated
  with check (public.is_superadmin());
create policy programs_admin_update on public.programs for update to authenticated
  using (public.is_superadmin() or public.program_role(id) = 'program_admin')
  with check (public.is_superadmin() or public.program_role(id) = 'program_admin');

drop policy if exists steps_admin_insert on public.workflow_steps;
create policy steps_admin_insert on public.workflow_steps for insert to authenticated
  with check (public.is_superadmin() or public.program_role(program_id) = 'program_admin');

drop policy if exists activities_admin_insert on public.program_activities;
create policy activities_admin_insert on public.program_activities for insert to authenticated
  with check (public.is_superadmin() or public.program_role(program_id) = 'program_admin');

drop policy if exists activities_admin_delete on public.program_activities;
create policy activities_admin_delete on public.program_activities for delete to authenticated
  using (public.is_superadmin() or public.program_role(program_id) = 'program_admin');

drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs for select to authenticated
  using (public.is_superadmin() or public.program_role(program_id) = 'program_admin');

create policy superadmin_profiles_manage on public.profiles for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create index profiles_system_role_idx on public.profiles(system_role);