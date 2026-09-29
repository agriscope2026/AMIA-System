create table public.program_calendar_day_notes (
  program_id uuid not null references public.programs(id) on delete cascade,
  note_date date not null,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (program_id, note_date),
  constraint program_calendar_day_notes_note_length
    check (char_length(btrim(note)) between 1 and 4000)
);

alter table public.program_calendar_day_notes enable row level security;
revoke all on table public.program_calendar_day_notes from anon, authenticated;
grant select, insert, update, delete on table public.program_calendar_day_notes to authenticated;

create policy calendar_day_notes_member_read
  on public.program_calendar_day_notes for select to authenticated
  using ((select public.is_program_member(program_id)));

create policy calendar_day_notes_editor_insert
  on public.program_calendar_day_notes for insert to authenticated
  with check ((select public.can_edit_program(program_id)));

create policy calendar_day_notes_editor_update
  on public.program_calendar_day_notes for update to authenticated
  using ((select public.can_edit_program(program_id)))
  with check ((select public.can_edit_program(program_id)));

create policy calendar_day_notes_editor_delete
  on public.program_calendar_day_notes for delete to authenticated
  using ((select public.can_edit_program(program_id)));