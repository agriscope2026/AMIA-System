alter table public.program_activities
  alter column start_date drop not null;

alter table public.program_activities
  add column if not exists fiscal_year integer;

alter table public.program_procurement_plan_items
  add column if not exists activity_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'program_procurement_plan_items_activity_id_fkey'
      and conrelid = 'public.program_procurement_plan_items'::regclass
  ) then
    alter table public.program_procurement_plan_items
      add constraint program_procurement_plan_items_activity_id_fkey
      foreign key (activity_id)
      references public.program_activities(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists program_activities_fiscal_year_idx
  on public.program_activities(program_id, fiscal_year)
  where fiscal_year is not null;

create unique index if not exists program_procurement_plan_items_activity_uidx
  on public.program_procurement_plan_items(activity_id)
  where activity_id is not null;

drop trigger if exists sync_app_plan_item_activity
  on public.program_procurement_plan_items;

insert into public.program_activities (
  program_id,
  activity_code,
  title,
  location,
  start_date,
  target_end_date,
  fiscal_year,
  approved_budget,
  activity_design,
  status,
  current_step_id,
  current_sub_step
)
select plan.program_id,
       'APP-' || item.id::text,
       item.project_title,
       nullif(btrim(item.implementing_unit), ''),
       item.procurement_start,
       item.procurement_end,
       plan.fiscal_year,
       item.estimated_budget,
       item.project_description,
       coalesce(step.title, 'Planning'),
       step.id,
       step.sub_steps ->> 0
from public.program_procurement_plan_items item
join public.program_procurement_plans plan on plan.id = item.plan_id
left join lateral (
  select workflow.id, workflow.title, workflow.sub_steps
  from public.workflow_steps workflow
  where workflow.program_id = plan.program_id
    and workflow.is_active
  order by workflow.step_order
  limit 1
) step on true
where plan.plan_type = 'APP'
  and btrim(item.project_title) <> ''
on conflict (program_id, activity_code) do update
set title = excluded.title,
    location = excluded.location,
    start_date = excluded.start_date,
    target_end_date = excluded.target_end_date,
    fiscal_year = excluded.fiscal_year,
    approved_budget = excluded.approved_budget,
    activity_design = excluded.activity_design;

update public.program_procurement_plan_items item
set activity_id = activity.id
from public.program_procurement_plans plan
cross join public.program_activities activity
where plan.id = item.plan_id
  and plan.plan_type = 'APP'
  and activity.program_id = plan.program_id
  and activity.activity_code = 'APP-' || item.id::text
  and item.activity_id is null;

create or replace function public.sync_app_plan_item_activity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  plan_record record;
  first_step_id uuid;
  first_step_title text;
  first_step_sub_steps jsonb;
  activity_id_value uuid;
begin
  select plan.program_id, plan.fiscal_year, plan.plan_type
    into plan_record
  from public.program_procurement_plans plan
  where plan.id = new.plan_id;

  if not found then
    raise exception 'The APP row must reference an existing procurement plan';
  end if;

  if plan_record.plan_type <> 'APP' then
    return new;
  end if;

  if btrim(new.project_title) = '' then
    raise exception 'APP project title is required to create its activity';
  end if;

  select workflow.id, workflow.title, workflow.sub_steps
    into first_step_id, first_step_title, first_step_sub_steps
  from public.workflow_steps workflow
  where workflow.program_id = plan_record.program_id
    and workflow.is_active
  order by workflow.step_order
  limit 1;

  if tg_op = 'UPDATE' and new.activity_id is null and old.activity_id is not null then
    new.activity_id := old.activity_id;
  end if;

  if new.activity_id is null then
    insert into public.program_activities (
      program_id,
      activity_code,
      title,
      location,
      start_date,
      target_end_date,
      fiscal_year,
      approved_budget,
      activity_design,
      status,
      current_step_id,
      current_sub_step
    )
    values (
      plan_record.program_id,
      'APP-' || new.id::text,
      new.project_title,
      nullif(btrim(new.implementing_unit), ''),
      new.procurement_start,
      new.procurement_end,
      plan_record.fiscal_year,
      new.estimated_budget,
      new.project_description,
      coalesce(first_step_title, 'Planning'),
      first_step_id,
      first_step_sub_steps ->> 0
    )
    returning id into activity_id_value;

    new.activity_id := activity_id_value;
  else
    update public.program_activities
    set title = new.project_title,
        location = nullif(btrim(new.implementing_unit), ''),
        start_date = new.procurement_start,
        target_end_date = new.procurement_end,
        fiscal_year = plan_record.fiscal_year,
        approved_budget = new.estimated_budget,
        activity_design = new.project_description
    where id = new.activity_id
      and program_id = plan_record.program_id;

    if not found then
      raise exception 'The linked APP activity must belong to the same program';
    end if;
  end if;

  return new;
end;
$$;

create trigger sync_app_plan_item_activity
  before insert or update on public.program_procurement_plan_items
  for each row execute procedure public.sync_app_plan_item_activity();

revoke all on function public.sync_app_plan_item_activity() from public, anon, authenticated;