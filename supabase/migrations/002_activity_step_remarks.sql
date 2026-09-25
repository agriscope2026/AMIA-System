alter table public.program_activities
  add column if not exists step_remarks jsonb not null default '{}'::jsonb;