begin;

alter table public.program_procurement_plan_items
  add column if not exists custom_values jsonb not null default '{}'::jsonb;

alter table public.program_procurement_plan_items
  alter column custom_values set default '{}'::jsonb,
  alter column custom_values set not null;

alter table public.program_procurement_plan_items
  drop constraint if exists program_procurement_plan_items_custom_values_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_procurement_plan_items'::regclass
      and conname = 'program_procurement_plan_items_custom_values_object_check'
  ) then
    alter table public.program_procurement_plan_items
      add constraint program_procurement_plan_items_custom_values_object_check
      check (jsonb_typeof(custom_values) = 'object');
  end if;
end;
$$;

create table if not exists public.program_finance_sheet_preferences (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 2000 and 2200),
  sheet_type text not null check (sheet_type in ('APP', 'WFP', 'PPMP', 'app', 'annual_allocations', 'procurement')),
  custom_columns jsonb not null default '[]'::jsonb
    check (jsonb_typeof(custom_columns) = 'array'),
  view_options jsonb not null default '{}'::jsonb
    check (jsonb_typeof(view_options) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, fiscal_year, sheet_type)
);

create index if not exists program_finance_sheet_preferences_program_year_idx
  on public.program_finance_sheet_preferences (program_id, fiscal_year desc);

alter table public.program_finance_sheet_preferences
  drop constraint if exists program_finance_sheet_preferences_sheet_type_check;

alter table public.program_finance_sheet_preferences
  add constraint program_finance_sheet_preferences_sheet_type_check
  check (sheet_type in ('APP', 'WFP', 'PPMP', 'app', 'annual_allocations', 'procurement'));

alter table public.program_finance_sheet_preferences enable row level security;
revoke all on public.program_finance_sheet_preferences from anon;
grant select, insert, update, delete on public.program_finance_sheet_preferences to authenticated;

drop policy if exists finance_sheet_preferences_member_read on public.program_finance_sheet_preferences;
create policy finance_sheet_preferences_member_read
  on public.program_finance_sheet_preferences
  for select to authenticated
  using (public.is_program_member(program_id));

drop policy if exists finance_sheet_preferences_admin_manage on public.program_finance_sheet_preferences;
create policy finance_sheet_preferences_admin_manage
  on public.program_finance_sheet_preferences
  for all to authenticated
  using (public.program_role(program_id) = 'program_admin')
  with check (public.program_role(program_id) = 'program_admin');

drop trigger if exists finance_sheet_preferences_touch_updated_at on public.program_finance_sheet_preferences;
create trigger finance_sheet_preferences_touch_updated_at
  before update on public.program_finance_sheet_preferences
  for each row execute function public.touch_updated_at();

commit;