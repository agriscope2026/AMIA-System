create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (program_id, user_id)
);

create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.program_activities(id) on delete cascade,
  step_id uuid references public.workflow_steps(id) on delete set null,
  parent_id uuid references public.activity_comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_program_member(target_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.program_members where program_id = target_program_id and user_id = auth.uid());
$$;

create or replace function public.program_role(target_program_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.program_members where program_id = target_program_id and user_id = auth.uid();
$$;

create or replace function public.can_edit_program(target_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.program_role(target_program_id) in ('admin', 'editor');
$$;

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_program_id uuid;
begin
  target_program_id := case
    when TG_TABLE_NAME = 'programs' then coalesce(NEW.id, OLD.id)
    when TG_TABLE_NAME = 'workflow_steps' then coalesce(NEW.program_id, OLD.program_id)
    when TG_TABLE_NAME = 'program_activities' then coalesce(NEW.program_id, OLD.program_id)
    when TG_TABLE_NAME = 'activity_comments' then (select program_id from public.program_activities where id = coalesce(NEW.activity_id, OLD.activity_id))
    else null
  end;
  insert into public.audit_logs(program_id, actor_id, action, entity_type, entity_id, details)
  values (target_program_id, auth.uid(), TG_OP, TG_TABLE_NAME, coalesce(NEW.id, OLD.id), jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)));
  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create trigger audit_programs after insert or update or delete on public.programs for each row execute procedure public.write_audit_log();
create trigger audit_workflow_steps after insert or update or delete on public.workflow_steps for each row execute procedure public.write_audit_log();
create trigger audit_program_activities after insert or update or delete on public.program_activities for each row execute procedure public.write_audit_log();
create trigger audit_activity_comments after insert or update or delete on public.activity_comments for each row execute procedure public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.program_members enable row level security;
alter table public.activity_comments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.programs enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.program_activities enable row level security;

create policy profiles_read_authenticated on public.profiles for select to authenticated using (true);
create policy members_read_self_or_admin on public.program_members for select to authenticated using (user_id = auth.uid() or public.program_role(program_id) = 'admin');
create policy members_admin_manage on public.program_members for all to authenticated using (public.program_role(program_id) = 'admin') with check (public.program_role(program_id) = 'admin');
create policy programs_member_read on public.programs for select to authenticated using (public.is_program_member(id));
create policy programs_admin_update on public.programs for update to authenticated using (public.program_role(id) = 'admin') with check (public.program_role(id) = 'admin');
create policy steps_member_read on public.workflow_steps for select to authenticated using (public.is_program_member(program_id));
create policy steps_editor_update on public.workflow_steps for update to authenticated using (public.can_edit_program(program_id)) with check (public.can_edit_program(program_id));
create policy steps_admin_insert on public.workflow_steps for insert to authenticated with check (public.program_role(program_id) = 'admin');
create policy activities_member_read on public.program_activities for select to authenticated using (public.is_program_member(program_id));
create policy activities_editor_update on public.program_activities for update to authenticated using (public.can_edit_program(program_id)) with check (public.can_edit_program(program_id));
create policy activities_admin_insert on public.program_activities for insert to authenticated with check (public.program_role(program_id) = 'admin');
create policy activities_admin_delete on public.program_activities for delete to authenticated using (public.program_role(program_id) = 'admin');
create policy comments_member_read on public.activity_comments for select to authenticated using (exists (select 1 from public.program_activities a where a.id = activity_id and public.is_program_member(a.program_id)));
create policy comments_member_insert on public.activity_comments for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.program_activities a where a.id = activity_id and public.is_program_member(a.program_id)));
create policy comments_author_update on public.activity_comments for update to authenticated using (author_id = auth.uid() or exists (select 1 from public.program_activities a where a.id = activity_id and public.program_role(a.program_id) = 'admin'));
create policy comments_author_delete on public.activity_comments for delete to authenticated using (author_id = auth.uid() or exists (select 1 from public.program_activities a where a.id = activity_id and public.program_role(a.program_id) = 'admin'));
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.program_role(program_id) = 'admin');

create index program_members_user_idx on public.program_members(user_id);
create index activity_comments_activity_idx on public.activity_comments(activity_id, created_at);
create index audit_logs_program_idx on public.audit_logs(program_id, created_at desc);