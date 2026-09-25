alter table public.program_activities
  add column if not exists activity_design text not null default '';
