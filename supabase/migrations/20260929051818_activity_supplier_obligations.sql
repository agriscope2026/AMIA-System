alter table public.activity_procurement_items
  add column workflow_step_id uuid references public.workflow_steps(id) on delete set null,
  add column obligated_amount numeric(14, 2) not null default 0,
  add column obligation_status text not null default 'Not obligated';

alter table public.activity_procurement_items
  add constraint activity_procurement_items_obligated_amount_check
    check (obligated_amount >= 0),
  add constraint activity_procurement_items_obligation_status_check
    check (obligation_status in ('Not obligated', 'Partially obligated', 'Obligated', 'Cancelled'));

create index activity_procurement_items_step_idx
  on public.activity_procurement_items (activity_id, workflow_step_id)
  where workflow_step_id is not null;

alter table public.program_activities
  add column unitemized_obligations numeric(14, 2) not null default 0;

update public.program_activities
set unitemized_obligations = recorded_spending;

alter table public.program_activities
  add constraint program_activities_unitemized_obligations_check
  check (unitemized_obligations >= 0);

create or replace function public.validate_procurement_program()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  linked_program_id uuid;
  step_program_id uuid;
begin
  select program_id into linked_program_id
  from public.program_activities
  where id = new.activity_id;

  if linked_program_id is null or linked_program_id <> new.program_id then
    raise exception 'Procurement item program must match its activity program';
  end if;

  if new.workflow_step_id is not null then
    select program_id into step_program_id
    from public.workflow_steps
    where id = new.workflow_step_id;

    if step_program_id is null or step_program_id <> new.program_id then
      raise exception 'Procurement workflow step must belong to the same program';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_activity_procurement_obligations()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  affected_activity_id uuid;
  previous_activity_id uuid;
  obligation_total numeric(14, 2);
  unitemized_total numeric(14, 2);
  approved_total numeric(14, 2);
begin
  if tg_op = 'DELETE' then
    previous_activity_id := old.activity_id;
  elsif tg_op = 'UPDATE' then
    if old.activity_id is distinct from new.activity_id then
      previous_activity_id := old.activity_id;
    end if;
  end if;

  if previous_activity_id is not null then
    affected_activity_id := previous_activity_id;
    select coalesce(sum(item.obligated_amount), 0)
    into obligation_total
    from public.activity_procurement_items item
    where item.activity_id = affected_activity_id
      and item.obligation_status in ('Partially obligated', 'Obligated');

    select activity.unitemized_obligations, activity.approved_budget
    into unitemized_total, approved_total
    from public.program_activities activity
    where activity.id = affected_activity_id;

    if found then
      if unitemized_total + obligation_total > approved_total then
        raise exception 'Total obligations cannot exceed the approved activity budget';
      end if;
      update public.program_activities
      set recorded_spending = unitemized_total + obligation_total,
          updated_at = now()
      where id = affected_activity_id;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    affected_activity_id := new.activity_id;
    select coalesce(sum(item.obligated_amount), 0)
    into obligation_total
    from public.activity_procurement_items item
    where item.activity_id = affected_activity_id
      and item.obligation_status in ('Partially obligated', 'Obligated');

    select activity.unitemized_obligations, activity.approved_budget
    into unitemized_total, approved_total
    from public.program_activities activity
    where activity.id = affected_activity_id;

    if found then
      if unitemized_total + obligation_total > approved_total then
        raise exception 'Total obligations cannot exceed the approved activity budget';
      end if;
      update public.program_activities
      set recorded_spending = unitemized_total + obligation_total,
          updated_at = now()
      where id = affected_activity_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger activity_procurement_obligations_sync
  after insert or update or delete on public.activity_procurement_items
  for each row execute function public.sync_activity_procurement_obligations();

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
      and (coalesce(new.approved_budget, 0) <> 0
        or coalesce(new.recorded_spending, 0) <> 0
        or coalesce(new.unitemized_obligations, 0) <> 0) then
      raise exception 'Only this program''s program admin can set activity financial amounts';
    end if;
    if tg_op = 'UPDATE'
      and (new.approved_budget is distinct from old.approved_budget
        or new.recorded_spending is distinct from old.recorded_spending
        or new.unitemized_obligations is distinct from old.unitemized_obligations) then
      raise exception 'Only this program''s program admin can edit activity financial amounts';
    end if;
  end if;
  return new;
end;
$$;