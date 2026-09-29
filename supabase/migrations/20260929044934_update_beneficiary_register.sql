alter table public.program_beneficiaries
  rename column beneficiary_code to beneficiary_acronym;

alter table public.program_beneficiaries
  rename column assistance_received to other_assistance_interventions;

alter table public.program_beneficiaries
  alter column other_assistance_interventions drop not null,
  add column sex text,
  add column age smallint,
  add column contact_number text,
  add column additional_details text,
  add column province text;

alter table public.program_beneficiaries
  drop constraint if exists program_beneficiaries_identity_check,
  drop constraint if exists program_beneficiaries_assistance_check,
  add constraint program_beneficiaries_identity_check check (
    nullif(btrim(beneficiary_name), '') is not null
    or nullif(btrim(beneficiary_acronym), '') is not null
  ),
  add constraint program_beneficiaries_age_check check (age is null or age between 0 and 130);

drop index if exists public.program_beneficiaries_program_code_idx;
create unique index program_beneficiaries_program_acronym_idx
  on public.program_beneficiaries (program_id, lower(btrim(beneficiary_acronym)))
  where beneficiary_acronym is not null and btrim(beneficiary_acronym) <> '';

create table public.program_beneficiary_interventions (
  beneficiary_id uuid not null references public.program_beneficiaries(id) on delete cascade,
  activity_id uuid not null references public.program_activities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (beneficiary_id, activity_id)
);

create index program_beneficiary_interventions_activity_idx
  on public.program_beneficiary_interventions (activity_id, beneficiary_id);

insert into public.program_beneficiary_interventions (beneficiary_id, activity_id)
select id, activity_id
from public.program_beneficiaries
where activity_id is not null
on conflict do nothing;

drop trigger if exists validate_beneficiary_activity_program on public.program_beneficiaries;
drop function if exists public.validate_beneficiary_activity_program();
alter table public.program_beneficiaries drop column activity_id;

alter table public.program_beneficiary_interventions enable row level security;
revoke all on table public.program_beneficiary_interventions from anon, authenticated;
grant select, insert, delete on table public.program_beneficiary_interventions to authenticated;

create policy beneficiary_interventions_member_read
  on public.program_beneficiary_interventions for select to authenticated
  using (
    exists (
      select 1
      from public.program_beneficiaries beneficiary
      where beneficiary.id = beneficiary_id
        and (select public.is_program_member(beneficiary.program_id))
    )
  );

create policy beneficiary_interventions_program_admin_insert
  on public.program_beneficiary_interventions for insert to authenticated
  with check (
    exists (
      select 1
      from public.program_beneficiaries beneficiary
      join public.program_activities activity
        on activity.id = program_beneficiary_interventions.activity_id
       and activity.program_id = beneficiary.program_id
      where beneficiary.id = program_beneficiary_interventions.beneficiary_id
        and (select public.program_role(beneficiary.program_id)) = 'program_admin'
    )
  );

create policy beneficiary_interventions_program_admin_delete
  on public.program_beneficiary_interventions for delete to authenticated
  using (
    exists (
      select 1
      from public.program_beneficiaries beneficiary
      where beneficiary.id = program_beneficiary_interventions.beneficiary_id
        and (select public.program_role(beneficiary.program_id)) = 'program_admin'
    )
  );

drop policy if exists beneficiaries_editor_insert on public.program_beneficiaries;
drop policy if exists beneficiaries_editor_update on public.program_beneficiaries;
drop policy if exists beneficiaries_editor_delete on public.program_beneficiaries;

create policy beneficiaries_program_admin_insert
  on public.program_beneficiaries for insert to authenticated
  with check ((select public.program_role(program_id)) = 'program_admin');

create policy beneficiaries_program_admin_update
  on public.program_beneficiaries for update to authenticated
  using ((select public.program_role(program_id)) = 'program_admin')
  with check ((select public.program_role(program_id)) = 'program_admin');

create policy beneficiaries_program_admin_delete
  on public.program_beneficiaries for delete to authenticated
  using ((select public.program_role(program_id)) = 'program_admin');

create function public.replace_beneficiary_interventions(
  target_beneficiary_id uuid,
  target_activity_ids uuid[]
)
returns void
language plpgsql
set search_path = public
as $$
declare
  target_program_id uuid;
begin
  select program_id
  into target_program_id
  from public.program_beneficiaries
  where id = target_beneficiary_id;

  if target_program_id is null
    or (select public.program_role(target_program_id)) is distinct from 'program_admin'
  then
    raise exception 'Only the program administrator can edit beneficiary interventions';
  end if;

  delete from public.program_beneficiary_interventions
  where beneficiary_id = target_beneficiary_id;

  insert into public.program_beneficiary_interventions (beneficiary_id, activity_id)
  select target_beneficiary_id, selected.activity_id
  from unnest(coalesce(target_activity_ids, '{}'::uuid[])) as selected(activity_id)
  where selected.activity_id is not null
  on conflict do nothing;
end;
$$;

revoke all on function public.replace_beneficiary_interventions(uuid, uuid[]) from public, anon;
grant execute on function public.replace_beneficiary_interventions(uuid, uuid[]) to authenticated;