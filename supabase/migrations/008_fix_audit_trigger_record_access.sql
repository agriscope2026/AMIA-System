create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  target_program_id uuid;
  target_entity_id uuid;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  target_entity_id := nullif(row_data->>'id', '')::uuid;

  if TG_TABLE_NAME = 'programs' then
    target_program_id := target_entity_id;
  elsif TG_TABLE_NAME in (
    'workflow_steps',
    'program_activities',
    'program_annual_allocations',
    'activity_procurement_items'
  ) then
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
