alter table public.program_activities
  add column if not exists completed_sub_steps jsonb not null default '{}'::jsonb;

create table if not exists public.program_annual_allocations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 2000 and 2200),
  fund_source text not null default 'General Appropriations Act (GAA)',
  allotment_reference text,
  obligation_reference text,
  disbursement_reference text,
  appropriation numeric(14, 2) not null default 0 check (appropriation >= 0),
  allotment_received numeric(14, 2) not null default 0 check (allotment_received >= 0),
  obligations numeric(14, 2) not null default 0 check (obligations >= 0),
  disbursements numeric(14, 2) not null default 0 check (disbursements >= 0),
  accounts_payable numeric(14, 2) not null default 0 check (accounts_payable >= 0),
  cash_advances numeric(14, 2) not null default 0 check (cash_advances >= 0),
  liquidation numeric(14, 2) not null default 0 check (liquidation >= 0),
  savings numeric(14, 2) not null default 0 check (savings >= 0),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, fiscal_year, fund_source),
  check (allotment_received <= appropriation),
  check (obligations <= allotment_received),
  check (disbursements <= obligations)
);

create table if not exists public.activity_procurement_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  activity_id uuid not null references public.program_activities(id) on delete cascade,
  category text not null,
  item_description text not null,
  supplier_name text not null,
  procurement_method text not null default 'Small Value Procurement',
  purchase_order_number text,
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit text not null default 'lot',
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  delivery_status text not null default 'For procurement'
    check (delivery_status in ('For procurement', 'Purchase order issued', 'Partially delivered', 'Delivered', 'Inspected and accepted', 'Cancelled')),
  delivery_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists annual_allocations_program_year_idx
  on public.program_annual_allocations(program_id, fiscal_year desc);
create index if not exists procurement_activity_idx
  on public.activity_procurement_items(activity_id, created_at);

create or replace function public.validate_procurement_program()
returns trigger language plpgsql set search_path = public as $$
declare
  linked_program_id uuid;
begin
  select program_id into linked_program_id
  from public.program_activities
  where id = new.activity_id;
  if linked_program_id is null or linked_program_id <> new.program_id then
    raise exception 'Procurement item program must match its activity program';
  end if;
  return new;
end;
$$;

create trigger validate_procurement_program
  before insert or update on public.activity_procurement_items
  for each row execute procedure public.validate_procurement_program();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger annual_allocations_touch_updated_at
  before update on public.program_annual_allocations
  for each row execute procedure public.touch_updated_at();
create trigger procurement_items_touch_updated_at
  before update on public.activity_procurement_items
  for each row execute procedure public.touch_updated_at();

create or replace function public.reorder_program_workflow_steps(
  target_program_id uuid,
  ordered_step_ids uuid[]
)
returns void
language plpgsql
set search_path = public
as $$
declare
  existing_count integer;
  requested_count integer;
  order_offset integer;
begin
  if not public.can_edit_program(target_program_id) then
    raise exception 'You do not have permission to reorder this program workflow';
  end if;

  select count(*) into existing_count
  from public.workflow_steps
  where program_id = target_program_id;
  requested_count := coalesce(cardinality(ordered_step_ids), 0);

  if existing_count <> requested_count
    or (select count(distinct step_id) from unnest(ordered_step_ids) as requested(step_id)) <> requested_count
    or exists (
      select 1
      from unnest(ordered_step_ids) as requested(step_id)
      left join public.workflow_steps step on step.id = requested.step_id
      where step.id is null or step.program_id <> target_program_id
    ) then
    raise exception 'The submitted workflow order does not match this program''s steps';
  end if;

  select coalesce(max(step_order), 0) + requested_count + 1 into order_offset
  from public.workflow_steps
  where program_id = target_program_id;

  update public.workflow_steps
  set step_order = step_order + order_offset
  where program_id = target_program_id;

  update public.workflow_steps step
  set step_order = requested.ordinality::integer
  from unnest(ordered_step_ids) with ordinality as requested(step_id, ordinality)
  where step.id = requested.step_id
    and step.program_id = target_program_id;
end;
$$;

alter table public.program_annual_allocations enable row level security;
alter table public.activity_procurement_items enable row level security;

create policy annual_allocations_member_read on public.program_annual_allocations
  for select to authenticated using (public.is_program_member(program_id));
create policy annual_allocations_editor_manage on public.program_annual_allocations
  for all to authenticated using (public.can_edit_program(program_id))
  with check (public.can_edit_program(program_id));

create policy procurement_member_read on public.activity_procurement_items
  for select to authenticated using (public.is_program_member(program_id));
create policy procurement_editor_manage on public.activity_procurement_items
  for all to authenticated using (public.can_edit_program(program_id))
  with check (public.can_edit_program(program_id));

create trigger audit_annual_allocations
  after insert or update or delete on public.program_annual_allocations
  for each row execute procedure public.write_audit_log();

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb;
  target_program_id uuid;
  target_entity_id uuid;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  target_entity_id := nullif(row_data->>'id', '')::uuid;

  if TG_TABLE_NAME = 'programs' then
    target_program_id := target_entity_id;
  elsif TG_TABLE_NAME in ('workflow_steps', 'program_activities', 'program_annual_allocations', 'activity_procurement_items') then
    target_program_id := nullif(row_data->>'program_id', '')::uuid;
  elsif TG_TABLE_NAME = 'activity_comments' then
    select program_id into target_program_id
    from public.program_activities
    where id = nullif(row_data->>'activity_id', '')::uuid;
  end if;

  insert into public.audit_logs(program_id, actor_id, action, entity_type, entity_id, details)
  values (
    target_program_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    target_entity_id,
    jsonb_build_object(
      'before', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
      'after', case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end
    )
  );
  return null;
end;
$$;

create trigger audit_procurement_items
  after insert or update or delete on public.activity_procurement_items
  for each row execute procedure public.write_audit_log();

drop policy if exists activities_editor_update on public.program_activities;
create policy activities_editor_update on public.program_activities for update to authenticated
  using (public.can_edit_program(program_id)) with check (public.can_edit_program(program_id));
