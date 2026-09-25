create extension if not exists pgcrypto;

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  acronym text not null,
  agency_title text not null default 'Department of Agriculture',
  office_subtitle text,
  description text,
  objectives jsonb not null default '[]'::jsonb,
  target_beneficiaries text,
  operating_units jsonb not null default '[]'::jsonb,
  logo_url text,
  banner_url text,
  theme_color text not null default '#1c6653',
  accent_color text not null default '#d8a642',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  title text not null,
  description text,
  sub_steps jsonb not null default '[]'::jsonb,
  assigned_role text not null,
  required_documents jsonb not null default '[]'::jsonb,
  sla_days integer not null default 5 check (sla_days > 0),
  status_tag text not null default 'Pending',
  is_optional boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, step_order)
);

create table public.program_activities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  activity_code text not null,
  title text not null,
  location text,
  start_date date not null,
  target_end_date date,
  approved_budget numeric(14, 2) not null default 0 check (approved_budget >= 0),
  recorded_spending numeric(14, 2) not null default 0 check (recorded_spending >= 0),
  activity_design text not null default '',
  status text not null default 'Planning',
  current_step_id uuid references public.workflow_steps(id) on delete set null,
  current_sub_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, activity_code)
);

create table public.activity_timeline_events (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.program_activities(id) on delete cascade,
  workflow_step_id uuid references public.workflow_steps(id) on delete set null,
  status text not null default 'Pending',
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_applications (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  reference_no text not null unique,
  applicant_name text not null,
  beneficiary_data jsonb not null default '{}'::jsonb,
  current_step_id uuid references public.workflow_steps(id) on delete set null,
  status text not null default 'In Progress',
  submitted_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.application_step_records (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.program_applications(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id) on delete restrict,
  status text not null default 'Pending',
  notes text,
  attachments jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (application_id, workflow_step_id)
);

create index workflow_steps_program_order_idx on public.workflow_steps (program_id, step_order);
create index program_activities_program_status_idx on public.program_activities (program_id, status);
create index activity_timeline_events_activity_idx on public.activity_timeline_events (activity_id, created_at);
create index applications_program_status_idx on public.program_applications (program_id, status);
create index step_records_application_idx on public.application_step_records (application_id);

insert into public.programs (title, acronym, description, target_beneficiaries, operating_units)
values
  ('Adaptation and Mitigation Initiative in Agriculture', 'AMIA', 'A program workspace for managing climate-resilient agriculture activities, procurement, fund utilization, and savings reconciliation.', 'Climate-vulnerable farmers, fisherfolk, cooperatives', '["AMIA Program Unit", "Field Operations", "Finance and Accounting"]'::jsonb),
  ('Kabuhayan at Kaunlaran Para sa Kababayang Katutubo', '4K', 'A program workspace for planning, procuring, delivering, and monitoring livelihood enterprise assistance for indigenous communities.', 'Indigenous farmer groups and community enterprises', '["4K Program Unit", "Procurement", "Field Operations", "Finance"]'::jsonb);

insert into public.workflow_steps (program_id, step_order, title, description, sub_steps, assigned_role, required_documents, sla_days, status_tag)
select p.id, v.step_order, v.title, v.description, v.sub_steps::jsonb, v.assigned_role, v.required_documents::jsonb, v.sla_days, v.status_tag
from public.programs p
join (values
  ('AMIA', 1, 'Activity Proposal & Work Plan', 'Define the activity, beneficiaries, outputs, schedule, and cost estimates.', '["Define activity scope", "Identify beneficiaries and outputs", "Prepare work and financial plan"]', 'AMIA Program Unit', '["Activity proposal", "Work and financial plan"]', 5, 'Completed'),
  ('AMIA', 2, 'Fund Allocation & Obligation', 'Confirm available allotment and record the obligation against the approved activity budget.', '["Confirm fund availability", "Prepare obligation request", "Record approved obligation"]', 'Budget and Finance Division', '["Obligation request", "Budget utilization request"]', 4, 'In Progress'),
  ('AMIA', 3, 'Activity Procurement', 'Prepare the purchase request, canvass or bidding documents, and procurement recommendation.', '["Prepare purchase request", "Conduct canvass or bidding", "Evaluate quotations", "Prepare procurement recommendation"]', 'Procurement Management Unit', '["Purchase request", "Canvass", "Abstract of quotations"]', 10, 'Pending'),
  ('AMIA', 4, 'Purchase Order / Contract Award', 'Issue the purchase order or contract and notify the selected supplier or service provider.', '["Finalize BAC resolution", "Issue purchase order or contract", "Notify supplier or service provider"]', 'BAC Secretariat / Supply Office', '["BAC resolution", "Purchase order", "Contract"]', 5, 'Pending'),
  ('AMIA', 5, 'Delivery, Inspection & Acceptance', 'Verify delivered goods or completed services against the approved specifications and activity plan.', '["Receive delivery", "Inspect goods or services", "Prepare acceptance report"]', 'Inspection and Acceptance Committee', '["Delivery receipt", "Inspection report", "Acceptance report"]', 7, 'Pending'),
  ('AMIA', 6, 'Activity Implementation & Distribution', 'Conduct the approved activity and document distribution, attendance, outputs, and beneficiary acknowledgement.', '["Prepare implementation arrangements", "Conduct activity and distribution", "Document attendance and outputs", "Obtain beneficiary acknowledgement"]', 'AMIA Field Operations Team', '["Attendance sheet", "Distribution list", "Photo documentation"]', 15, 'Pending'),
  ('AMIA', 7, 'Accomplishment & Liquidation', 'Submit the accomplishment report and supporting financial documents for liquidation and payment recording.', '["Prepare accomplishment report", "Compile financial documents", "Submit liquidation documents"]', 'AMIA Program Unit / Finance', '["Accomplishment report", "Disbursement voucher", "Receipts"]', 10, 'Pending'),
  ('AMIA', 8, 'Savings & Fund Reversion', 'Reconcile actual expenditures against the obligation, record savings, and process fund reversion or realignment.', '["Reconcile actual expenditures", "Record savings", "Process fund reversion or realignment"]', 'Finance and Accounting Division', '["Obligation reconciliation", "Savings report", "Reversion document"]', 7, 'Pending'),
  ('4K', 1, 'Enterprise Activity Planning', 'Identify the livelihood enterprise, beneficiaries, outputs, and approved implementation schedule.', '["Define enterprise activity", "Validate beneficiaries", "Prepare implementation schedule"]', '4K Program Unit', '["Enterprise proposal", "Beneficiary profile"]', 7, 'Completed'),
  ('4K', 2, 'Fund Availability & Obligation', 'Validate the program allocation and record the approved obligation for the enterprise activity.', '["Confirm fund availability", "Prepare obligation request", "Record approved obligation"]', 'Budget and Finance Division', '["Work and financial plan", "Obligation request"]', 5, 'In Progress'),
  ('4K', 3, 'Procurement of Inputs / Services', 'Procure farm inputs, equipment, or services based on the approved enterprise plan and specifications.', '["Prepare purchase request", "Conduct canvass or bidding", "Evaluate offers", "Recommend supplier or service provider"]', 'Procurement Management Unit', '["Purchase request", "Canvass or bidding documents"]', 12, 'Pending'),
  ('4K', 4, 'Inspection & Acceptance', 'Inspect the procured inputs or equipment and confirm quantity, quality, and compliance.', '["Receive delivery", "Inspect inputs or equipment", "Prepare inspection and acceptance report"]', 'Inspection and Acceptance Committee', '["Delivery receipt", "Inspection and acceptance report"]', 7, 'Pending'),
  ('4K', 5, 'Release & Enterprise Implementation', 'Release assistance to qualified beneficiaries and carry out the approved enterprise activity.', '["Confirm qualified beneficiaries", "Release assistance", "Conduct enterprise activity", "Document beneficiary acknowledgement"]', '4K Field Operations Team', '["Release form", "Beneficiary acknowledgement", "Activity photos"]', 15, 'Pending'),
  ('4K', 6, 'Monitoring & Accomplishment', 'Monitor enterprise progress, validate outputs, and submit the physical and financial accomplishment report.', '["Monitor enterprise progress", "Validate outputs", "Prepare accomplishment report"]', 'Planning and Monitoring Division', '["Monitoring report", "Accomplishment report"]', 20, 'Pending'),
  ('4K', 7, 'Liquidation & Savings Recording', 'Complete liquidation, reconcile actual cost, and record any unused balance as savings.', '["Compile liquidation documents", "Reconcile actual cost", "Record savings"]', '4K Program Unit / Finance', '["Liquidation report", "Receipts", "Savings reconciliation"]', 10, 'Pending')
) as v(acronym, step_order, title, description, sub_steps, assigned_role, required_documents, sla_days, status_tag) on v.acronym = p.acronym;

insert into public.program_activities (program_id, activity_code, title, location, start_date, target_end_date, approved_budget, recorded_spending, status, current_step_id)
select p.id, v.activity_code, v.title, v.location, v.start_date::date, v.target_end_date::date, v.approved_budget, v.recorded_spending, v.status, ws.id
from public.programs p
join (values
  ('AMIA', 'AMIA-2026-001', 'Climate-smart vegetable production inputs', 'Benguet', '2026-04-08', '2026-06-30', 850000, 420000, 'Procurement', 'Activity Procurement'),
  ('AMIA', 'AMIA-2026-002', 'Rainwater harvesting support', 'Ifugao', '2026-05-18', '2026-09-30', 1200000, 1200000, 'Implementation', 'Activity Implementation & Distribution'),
  ('4K', '4K-2026-001', 'Indigenous coffee enterprise starter kits', 'Apayao', '2026-03-11', '2026-08-30', 980000, 185000, 'Procurement', 'Procurement of Inputs / Services')
) as v(acronym, activity_code, title, location, start_date, target_end_date, approved_budget, recorded_spending, status, current_step_title) on v.acronym = p.acronym
left join public.workflow_steps ws on ws.program_id = p.id and ws.title = v.current_step_title;
