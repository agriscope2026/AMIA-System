begin;

alter table public.program_procurement_plan_items
  add column if not exists row_order bigint,
  add column if not exists version bigint not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists formula_values jsonb not null default '{}'::jsonb;

with ordered_items as (
  select id,
         row_number() over (partition by plan_id order by created_at, id) - 1 as position
  from public.program_procurement_plan_items
)
update public.program_procurement_plan_items item
set row_order = ordered_items.position
from ordered_items
where item.id = ordered_items.id
  and item.row_order is null;

alter table public.program_procurement_plan_items
  alter column row_order set default 0,
  alter column row_order set not null,
  add constraint program_procurement_plan_items_row_order_nonnegative_check check (row_order >= 0),
  add constraint program_procurement_plan_items_version_positive_check check (version > 0),
  add constraint program_procurement_plan_items_formula_values_object_check
    check (jsonb_typeof(formula_values) = 'object');

alter table public.program_finance_sheet_preferences
  add constraint program_finance_sheet_preferences_view_options_size_check
    check (octet_length(view_options::text) <= 1048576),
  add constraint program_finance_sheet_preferences_custom_columns_size_check
    check (octet_length(custom_columns::text) <= 262144);

create index if not exists program_procurement_plan_items_live_order_idx
  on public.program_procurement_plan_items(plan_id, row_order, id)
  where deleted_at is null;

create index if not exists program_procurement_plan_items_live_updated_idx
  on public.program_procurement_plan_items(plan_id, updated_at desc, id)
  where deleted_at is null;

create or replace function public.bump_finance_plan_item_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists procurement_plan_items_touch_updated_at
  on public.program_procurement_plan_items;
drop trigger if exists program_procurement_plan_items_version
  on public.program_procurement_plan_items;

create trigger program_procurement_plan_items_version
  before update on public.program_procurement_plan_items
  for each row execute function public.bump_finance_plan_item_version();

drop policy if exists procurement_plan_items_member_read
  on public.program_procurement_plan_items;
create policy procurement_plan_items_member_read
  on public.program_procurement_plan_items
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.program_procurement_plans plan
      where plan.id = program_procurement_plan_items.plan_id
        and public.is_program_member(plan.program_id)
    )
  );

create or replace function public.audit_finance_plan_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_data jsonb;
  target_program_id uuid;
  target_item_id uuid;
begin
  item_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_item_id := (item_data->>'id')::uuid;

  select plan.program_id
  into target_program_id
  from public.program_procurement_plans plan
  where plan.id = (item_data->>'plan_id')::uuid;

  insert into public.audit_logs(program_id, actor_id, action, entity_type, entity_id, details)
  values (
    target_program_id,
    auth.uid(),
    tg_op,
    'program_procurement_plan_items',
    target_item_id,
    jsonb_build_object(
      'before', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      'after', case when tg_op = 'DELETE' then null else to_jsonb(new) end
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_finance_plan_items
  on public.program_procurement_plan_items;
create trigger audit_finance_plan_items
  after insert or update or delete on public.program_procurement_plan_items
  for each row execute function public.audit_finance_plan_item();

create or replace function public.finance_page_plan_items(
  target_plan_id uuid,
  page_size integer default 100,
  page_offset integer default 0,
  search_text text default null,
  sort_key text default 'row_order',
  sort_direction text default 'asc'
)
returns setof public.program_procurement_plan_items
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if page_size < 1 or page_size > 250 then
    raise exception 'page_size must be between 1 and 250';
  end if;
  if page_offset < 0 or page_offset > 1000000 then
    raise exception 'page_offset must be between 0 and 1000000';
  end if;
  if sort_key not in (
    'row_order', 'project_title', 'implementing_unit', 'estimated_budget',
    'procurement_start', 'procurement_end', 'updated_at'
  ) then
    raise exception 'Unsupported finance sort key';
  end if;
  if sort_direction not in ('asc', 'desc') then
    raise exception 'sort_direction must be asc or desc';
  end if;
  if search_text is not null and length(search_text) > 200 then
    raise exception 'search_text must not exceed 200 characters';
  end if;

  return query
  select item.*
  from public.program_procurement_plan_items item
  where item.plan_id = target_plan_id
    and item.deleted_at is null
    and (
      search_text is null
      or concat_ws(
        ' ',
        item.project_title,
        item.implementing_unit,
        item.project_description,
        item.procurement_mode,
        item.source_of_fund,
        item.procurement_strategy,
        item.remarks,
        item.estimated_budget::text,
        item.custom_values::text
      ) ilike '%' || search_text || '%'
    )
  order by
    case when sort_key = 'row_order' and sort_direction = 'asc' then item.row_order end asc,
    case when sort_key = 'row_order' and sort_direction = 'desc' then item.row_order end desc,
    case when sort_key = 'project_title' and sort_direction = 'asc' then item.project_title end asc,
    case when sort_key = 'project_title' and sort_direction = 'desc' then item.project_title end desc,
    case when sort_key = 'implementing_unit' and sort_direction = 'asc' then item.implementing_unit end asc,
    case when sort_key = 'implementing_unit' and sort_direction = 'desc' then item.implementing_unit end desc,
    case when sort_key = 'estimated_budget' and sort_direction = 'asc' then item.estimated_budget end asc,
    case when sort_key = 'estimated_budget' and sort_direction = 'desc' then item.estimated_budget end desc,
    case when sort_key = 'procurement_start' and sort_direction = 'asc' then item.procurement_start end asc,
    case when sort_key = 'procurement_start' and sort_direction = 'desc' then item.procurement_start end desc,
    case when sort_key = 'procurement_end' and sort_direction = 'asc' then item.procurement_end end asc,
    case when sort_key = 'procurement_end' and sort_direction = 'desc' then item.procurement_end end desc,
    case when sort_key = 'updated_at' and sort_direction = 'asc' then item.updated_at end asc,
    case when sort_key = 'updated_at' and sort_direction = 'desc' then item.updated_at end desc,
    item.id
  offset page_offset
  limit page_size;
end;
$$;

create or replace function public.finance_apply_plan_item_batch(
  target_plan_id uuid,
  operations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  operation jsonb;
  fields jsonb;
  operation_name text;
  target_item_id uuid;
  expected_version bigint;
  saved_item public.program_procurement_plan_items%rowtype;
  changed_ids jsonb := '[]'::jsonb;
  allowed_fields constant text[] := array[
    'project_title', 'implementing_unit', 'project_description',
    'procurement_mode', 'early_procurement_activity', 'bid_evaluation_criteria',
    'procurement_start', 'procurement_end', 'source_of_fund',
    'estimated_budget', 'procurement_strategy', 'remarks',
    'custom_values', 'formula_values'
  ];
  field_name text;
begin
  if jsonb_typeof(operations) is distinct from 'array' then
    raise exception 'operations must be a JSON array';
  end if;
  if jsonb_array_length(operations) < 1 or jsonb_array_length(operations) > 250 then
    raise exception 'operations must be a non-empty array of at most 250 entries';
  end if;
  if octet_length(operations::text) > 1048576 then
    raise exception 'Finance batch payload must not exceed 1 MiB';
  end if;

  perform 1
  from public.program_procurement_plans plan
  where plan.id = target_plan_id
    and public.program_role(plan.program_id) = 'program_admin'
  for update;
  if not found then
    raise exception 'Finance sheet not found or caller is not an authorized program admin';
  end if;

  for operation in select value from jsonb_array_elements(operations)
  loop
    if jsonb_typeof(operation) <> 'object' then
      raise exception 'Each batch operation must be an object';
    end if;

    operation_name := operation->>'op';
    fields := coalesce(operation->'fields', '{}'::jsonb);
    if jsonb_typeof(fields) <> 'object' then
      raise exception 'Operation fields must be an object';
    end if;

    for field_name in select jsonb_object_keys(fields)
    loop
      if not field_name = any(allowed_fields) then
        raise exception 'Unsupported finance field: %', field_name;
      end if;
    end loop;

    if fields ? 'custom_values' and jsonb_typeof(fields->'custom_values') <> 'object' then
      raise exception 'custom_values must be a JSON object';
    end if;
    if fields ? 'formula_values' and jsonb_typeof(fields->'formula_values') <> 'object' then
      raise exception 'formula_values must be a JSON object';
    end if;
    if fields ? 'estimated_budget'
      and fields->>'estimated_budget' !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then
      raise exception 'estimated_budget must be a non-negative decimal with at most two fractional digits';
    end if;

    if operation_name = 'create' then
      insert into public.program_procurement_plan_items (
        plan_id, row_order, project_title, implementing_unit,
        project_description, procurement_mode, early_procurement_activity,
        bid_evaluation_criteria, procurement_start, procurement_end,
        source_of_fund, estimated_budget, procurement_strategy, remarks,
        custom_values, formula_values
      )
      select
        target_plan_id,
        coalesce((select max(row_order) + 1 from public.program_procurement_plan_items
                  where plan_id = target_plan_id and deleted_at is null), 0),
        coalesce(fields->>'project_title', ''),
        coalesce(fields->>'implementing_unit', ''),
        coalesce(fields->>'project_description', ''),
        coalesce(fields->>'procurement_mode', ''),
        coalesce((fields->>'early_procurement_activity')::boolean, false),
        coalesce(fields->>'bid_evaluation_criteria', ''),
        nullif(fields->>'procurement_start', '')::date,
        nullif(fields->>'procurement_end', '')::date,
        coalesce(fields->>'source_of_fund', ''),
        coalesce((fields->>'estimated_budget')::numeric(14, 2), 0),
        coalesce(fields->>'procurement_strategy', ''),
        coalesce(fields->>'remarks', ''),
        coalesce(fields->'custom_values', '{}'::jsonb),
        coalesce(fields->'formula_values', '{}'::jsonb)
      returning * into saved_item;
    elsif operation_name in ('update', 'delete') then
      target_item_id := nullif(operation->>'id', '')::uuid;
      expected_version := nullif(operation->>'expected_version', '')::bigint;
      if target_item_id is null or expected_version is null then
        raise exception 'Updates and deletes require an item id and expected_version';
      end if;

      if operation_name = 'delete' then
        update public.program_procurement_plan_items
        set deleted_at = now()
        where id = target_item_id
          and plan_id = target_plan_id
          and version = expected_version
          and deleted_at is null
        returning * into saved_item;
      else
        update public.program_procurement_plan_items item
        set project_title = case when fields ? 'project_title' then fields->>'project_title' else item.project_title end,
            implementing_unit = case when fields ? 'implementing_unit' then fields->>'implementing_unit' else item.implementing_unit end,
            project_description = case when fields ? 'project_description' then fields->>'project_description' else item.project_description end,
            procurement_mode = case when fields ? 'procurement_mode' then fields->>'procurement_mode' else item.procurement_mode end,
            early_procurement_activity = case when fields ? 'early_procurement_activity' then (fields->>'early_procurement_activity')::boolean else item.early_procurement_activity end,
            bid_evaluation_criteria = case when fields ? 'bid_evaluation_criteria' then fields->>'bid_evaluation_criteria' else item.bid_evaluation_criteria end,
            procurement_start = case when fields ? 'procurement_start' then nullif(fields->>'procurement_start', '')::date else item.procurement_start end,
            procurement_end = case when fields ? 'procurement_end' then nullif(fields->>'procurement_end', '')::date else item.procurement_end end,
            source_of_fund = case when fields ? 'source_of_fund' then fields->>'source_of_fund' else item.source_of_fund end,
            estimated_budget = case when fields ? 'estimated_budget' then (fields->>'estimated_budget')::numeric(14, 2) else item.estimated_budget end,
            procurement_strategy = case when fields ? 'procurement_strategy' then fields->>'procurement_strategy' else item.procurement_strategy end,
            remarks = case when fields ? 'remarks' then fields->>'remarks' else item.remarks end,
            custom_values = case when fields ? 'custom_values' then fields->'custom_values' else item.custom_values end,
            formula_values = case when fields ? 'formula_values' then fields->'formula_values' else item.formula_values end
        where item.id = target_item_id
          and item.plan_id = target_plan_id
          and item.version = expected_version
          and item.deleted_at is null
        returning item.* into saved_item;
      end if;

      if not found then
        raise exception 'Finance row changed, was deleted, or is not accessible; reload before retrying';
      end if;
    else
      raise exception 'Unsupported finance operation: %', operation_name;
    end if;

    changed_ids := changed_ids || jsonb_build_array(
      to_jsonb(saved_item)
      || jsonb_build_object('estimated_budget', saved_item.estimated_budget::text)
    );
  end loop;

  return changed_ids;
end;
$$;

create or replace function public.finance_reorder_plan_items(
  target_plan_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  live_count bigint;
begin
  perform 1
  from public.program_procurement_plans plan
  where plan.id = target_plan_id
    and public.program_role(plan.program_id) = 'program_admin'
  for update;
  if not found then
    raise exception 'Finance sheet not found or caller is not an authorized program admin';
  end if;

  if ordered_ids is null
    or cardinality(ordered_ids) > 10000
    or cardinality(ordered_ids) <> (
      select count(distinct id) from unnest(ordered_ids) as ids(id)
    ) then
    raise exception 'Invalid row ordering';
  end if;

  select count(*) into live_count
  from public.program_procurement_plan_items
  where plan_id = target_plan_id and deleted_at is null;
  if live_count <> cardinality(ordered_ids)
    or exists (
      select 1
      from unnest(ordered_ids) as ids(id)
      left join public.program_procurement_plan_items item
        on item.id = ids.id
       and item.plan_id = target_plan_id
       and item.deleted_at is null
      where item.id is null
    ) then
    raise exception 'Row ordering must include every live row exactly once';
  end if;

  update public.program_procurement_plan_items item
  set row_order = ordering.ordinality - 1
  from unnest(ordered_ids) with ordinality as ordering(id, ordinality)
  where item.id = ordering.id
    and item.plan_id = target_plan_id
    and item.row_order <> ordering.ordinality - 1;
end;
$$;

revoke all on function public.finance_page_plan_items(uuid, integer, integer, text, text, text) from public, anon;
revoke all on function public.finance_apply_plan_item_batch(uuid, jsonb) from public, anon;
revoke all on function public.finance_reorder_plan_items(uuid, uuid[]) from public, anon;
grant execute on function public.finance_page_plan_items(uuid, integer, integer, text, text, text) to authenticated;
grant execute on function public.finance_apply_plan_item_batch(uuid, jsonb) to authenticated;
grant execute on function public.finance_reorder_plan_items(uuid, uuid[]) to authenticated;

commit;