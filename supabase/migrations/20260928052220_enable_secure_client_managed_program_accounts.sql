create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, system_role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    'user'
  )
  on conflict (id) do update
  set email = excluded.email;
  return new;
end;
$$;

drop policy if exists members_admin_manage on public.program_members;
drop policy if exists members_superadmin_manage on public.program_members;
drop policy if exists members_program_admin_add_viewer on public.program_members;
drop policy if exists members_program_admin_update_viewer on public.program_members;
drop policy if exists members_program_admin_delete_viewer on public.program_members;

create policy members_superadmin_manage on public.program_members
  for all to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

create policy members_program_admin_add_viewer on public.program_members
  for insert to authenticated
  with check (
    role = 'viewer'
    and (select public.program_role(program_id)) = 'program_admin'
  );

create policy members_program_admin_update_viewer on public.program_members
  for update to authenticated
  using (
    role = 'viewer'
    and (select public.program_role(program_id)) = 'program_admin'
  )
  with check (
    role = 'viewer'
    and (select public.program_role(program_id)) = 'program_admin'
  );

create policy members_program_admin_delete_viewer on public.program_members
  for delete to authenticated
  using (
    role = 'viewer'
    and (select public.program_role(program_id)) = 'program_admin'
  );

revoke update on public.program_members from public, anon, authenticated;
grant update (role) on public.program_members to authenticated;

drop policy if exists profiles_program_admin_update_viewers on public.profiles;
create policy profiles_program_admin_update_viewers on public.profiles
  for update to authenticated
  using (
    exists (
      select 1
      from public.program_members target_member
      join public.program_members actor_membership
        on actor_membership.program_id = target_member.program_id
      where target_member.user_id = profiles.id
        and target_member.role = 'viewer'
        and actor_membership.user_id = (select auth.uid())
        and actor_membership.role = 'program_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.program_members target_member
      join public.program_members actor_membership
        on actor_membership.program_id = target_member.program_id
      where target_member.user_id = profiles.id
        and target_member.role = 'viewer'
        and actor_membership.user_id = (select auth.uid())
        and actor_membership.role = 'program_admin'
    )
  );

revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, updated_at) on public.profiles to authenticated;