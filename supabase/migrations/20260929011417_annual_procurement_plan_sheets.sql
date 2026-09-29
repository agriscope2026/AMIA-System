create table public.program_procurement_plans (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 2000 and 2200),
  plan_type text not null check (plan_type in ('APP', 'WFP', 'PPMP')),
  is_continuing boolean not null default false,
  plan_status text not null default 'Indicative' check (plan_status in ('Indicative', 'Final')),
  version_no text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, fiscal_year, plan_type)
);

create table public.program_procurement_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.program_procurement_plans(id) on delete cascade,
  project_title text not null default '',
  implementing_unit text not null default '',
  project_description text not null default '',
  procurement_mode text not null default '',
  early_procurement_activity boolean not null default false,
  bid_evaluation_criteria text not null default '',
  procurement_start date,
  procurement_end date,
  source_of_fund text not null default '',
  estimated_budget numeric(14, 2) not null default 0 check (estimated_budget >= 0),
  procurement_strategy text not null default '',
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (procurement_start is null or procurement_end is null or procurement_start <= procurement_end)
);

create index program_procurement_plans_program_year_idx
  on public.program_procurement_plans(program_id, fiscal_year desc, plan_type);
create index program_procurement_plan_items_plan_idx
  on public.program_procurement_plan_items(plan_id, created_at);

do $$
declare
  check_constraint record;
begin
  for check_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.program_annual_allocations'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%obligations <= allotment_received%'
        or pg_get_constraintdef(oid) ilike '%disbursements <= obligations%'
      )
  loop
    execute format('alter table public.program_annual_allocations drop constraint %I', check_constraint.conname);
  end loop;
end;
$$;

alter table public.program_procurement_plans enable row level security;
alter table public.program_procurement_plan_items enable row level security;

revoke all on public.program_procurement_plans, public.program_procurement_plan_items from anon;
grant select, insert, update, delete on public.program_procurement_plans, public.program_procurement_plan_items to authenticated;

create policy procurement_plans_member_read on public.program_procurement_plans
  for select to authenticated using (public.is_program_member(program_id));
create policy procurement_plans_admin_manage on public.program_procurement_plans
  for all to authenticated
  using (public.program_role(program_id) = 'program_admin')
  with check (public.program_role(program_id) = 'program_admin');

create policy procurement_plan_items_member_read on public.program_procurement_plan_items
  for select to authenticated using (
    exists (
      select 1
      from public.program_procurement_plans plan
      where plan.id = program_procurement_plan_items.plan_id
        and public.is_program_member(plan.program_id)
    )
  );
create policy procurement_plan_items_admin_manage on public.program_procurement_plan_items
  for all to authenticated
  using (
    exists (
      select 1
      from public.program_procurement_plans plan
      where plan.id = program_procurement_plan_items.plan_id
        and public.program_role(plan.program_id) = 'program_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.program_procurement_plans plan
      where plan.id = program_procurement_plan_items.plan_id
        and public.program_role(plan.program_id) = 'program_admin'
    )
  );

drop policy if exists annual_allocations_editor_manage on public.program_annual_allocations;
create policy annual_allocations_program_admin_manage on public.program_annual_allocations
  for all to authenticated
  using (public.program_role(program_id) = 'program_admin')
  with check (public.program_role(program_id) = 'program_admin');

drop policy if exists procurement_editor_manage on public.activity_procurement_items;
create policy procurement_items_program_admin_manage on public.activity_procurement_items
  for all to authenticated
  using (public.program_role(program_id) = 'program_admin')
  with check (public.program_role(program_id) = 'program_admin');
revoke insert, update, delete on public.program_annual_allocations, public.activity_procurement_items from anon, authenticated;
grant select, insert, update, delete on public.program_annual_allocations, public.activity_procurement_items to authenticated;

create or replace function public.protect_activity_financial_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if public.program_role(new.program_id) is distinct from 'program_admin' then
    if tg_op = 'INSERT'
      and (coalesce(new.approved_budget, 0) <> 0 or coalesce(new.recorded_spending, 0) <> 0) then
      raise exception 'Only this program''s program admin can set activity financial amounts';
    end if;
    if tg_op = 'UPDATE'
      and (new.approved_budget is distinct from old.approved_budget
        or new.recorded_spending is distinct from old.recorded_spending) then
      raise exception 'Only this program''s program admin can edit activity financial amounts';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_activity_financial_fields
  before insert or update on public.program_activities
  for each row execute procedure public.protect_activity_financial_fields();

create trigger procurement_plans_touch_updated_at
  before update on public.program_procurement_plans
  for each row execute procedure public.touch_updated_at();
create trigger procurement_plan_items_touch_updated_at
  before update on public.program_procurement_plan_items
  for each row execute procedure public.touch_updated_at();