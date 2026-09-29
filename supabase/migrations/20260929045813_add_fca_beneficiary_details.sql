alter table public.program_beneficiaries
  add column fca_category text,
  add column membership_count integer,
  add column contact_person text;

alter table public.program_beneficiaries
  add constraint program_beneficiaries_membership_count_check
  check (membership_count is null or membership_count >= 0);