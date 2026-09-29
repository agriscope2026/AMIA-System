create table public.program_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  activity_id uuid references public.program_activities(id) on delete set null,
  beneficiary_name text,
  beneficiary_code text,
  municipality text,
  barangay text,
  assistance_received text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_beneficiaries_identity_check check (
    nullif(btrim(beneficiary_name), '') is not null
    or nullif(btrim(beneficiary_code), '') is not null
  ),
  constraint program_beneficiaries_assistance_check check (
    nullif(btrim(assistance_received), '') is not null
  )
);

create index program_beneficiaries_program_created_idx
  on public.program_beneficiaries (program_id, created_at desc);
create index program_beneficiaries_activity_idx
  on public.program_beneficiaries (activity_id)
  where activity_id is not null;
create unique index program_beneficiaries_program_code_idx
  on public.program_beneficiaries (program_id, lower(btrim(beneficiary_code)))
  where beneficiary_code is not null and btrim(beneficiary_code) <> '';

create function public.validate_beneficiary_activity_program()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  activity_program_id uuid;
begin
  if new.activity_id is null then
    return new;
  end if;

  select activity.program_id into activity_program_id
  from public.program_activities activity
  where activity.id = new.activity_id;

  if activity_program_id is null or activity_program_id <> new.program_id then
    raise exception 'The selected activity must belong to the beneficiary program';
  end if;

  return new;
end;
$$;

create trigger validate_beneficiary_activity_program
  before insert or update of program_id, activity_id on public.program_beneficiaries
  for each row execute function public.validate_beneficiary_activity_program();

alter table public.program_beneficiaries enable row level security;
revoke all on table public.program_beneficiaries from anon, authenticated;
grant select, insert, update, delete on table public.program_beneficiaries to authenticated;

create policy beneficiaries_member_read
  on public.program_beneficiaries for select to authenticated
  using ((select public.is_program_member(program_id)));

create policy beneficiaries_editor_insert
  on public.program_beneficiaries for insert to authenticated
  with check ((select public.can_edit_program(program_id)));

create policy beneficiaries_editor_update
  on public.program_beneficiaries for update to authenticated
  using ((select public.can_edit_program(program_id)))
  with check ((select public.can_edit_program(program_id)));

create policy beneficiaries_editor_delete
  on public.program_beneficiaries for delete to authenticated
  using ((select public.can_edit_program(program_id)));