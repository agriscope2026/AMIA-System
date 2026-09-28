-- Optional, rerunnable demonstration data for a NON-PRODUCTION Supabase project.
-- Apply schema migrations 001 through 007 first, create at least one Auth user,
-- and run this script from the Supabase SQL Editor as a database owner.
-- All financial amounts, applicants, suppliers, notes, and references below are fictional.
-- No Auth users or passwords are created by this seed.

begin;

do $$
begin
  if not exists (select 1 from auth.users) then
    raise exception 'Create a real Supabase Auth user before running the demo seed.';
  end if;
end;
$$;

-- Keep profiles tied to real Supabase Auth users. Preserve existing names and roles.
insert into public.profiles (id, full_name, email)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       u.email
from auth.users u
where u.email is not null
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.profiles) then
    raise exception 'No profile could be created from the existing Auth users.';
  end if;
end;
$$;

-- Create the sample program records when migration 001 has not already done so.
-- Existing program details are deliberately left unchanged.
insert into public.programs (
  title, acronym, description, target_beneficiaries, operating_units
)
select sample.title, sample.acronym, sample.description,
       sample.target_beneficiaries, sample.operating_units::jsonb
from (values
  ('Adaptation and Mitigation Initiative in Agriculture', 'AMIA', 'DEMO - Sample workspace for climate-resilient agriculture activities, procurement, and fund utilization.', 'Climate-vulnerable farmers, fisherfolk, and cooperatives', '["AMIA Program Unit", "Field Operations", "Finance and Accounting"]'),
  ('Kabuhayan at Kaunlaran Para sa Kababayang Katutubo', '4K', 'DEMO - Sample workspace for indigenous community livelihood and enterprise activities.', 'Indigenous farmer groups and community enterprises', '["4K Program Unit", "Procurement", "Field Operations", "Finance"]')
) as sample(title, acronym, description, target_beneficiaries, operating_units)
where not exists (
  select 1 from public.programs existing where existing.acronym = sample.acronym
);

-- Add baseline sample workflows only for programs with no workflow rows.
-- A customized or partially maintained workflow is never replaced or reordered.
insert into public.workflow_steps (
  program_id, step_order, title, description, sub_steps, assigned_role,
  required_documents, sla_days, status_tag
)
select p.id, sample.step_order, sample.title, sample.description,
       sample.sub_steps::jsonb, sample.assigned_role,
       sample.required_documents::jsonb, sample.sla_days, sample.status_tag
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
) as sample(acronym, step_order, title, description, sub_steps, assigned_role, required_documents, sla_days, status_tag)
  on sample.acronym = p.acronym
where not exists (
  select 1 from public.workflow_steps existing
  where existing.program_id = p.id
);

-- Give the existing Superadmin a program membership for demo workflows.
insert into public.program_members (program_id, user_id, role)
select p.id, profile.id, 'program_admin'
from public.programs p
cross join lateral (
  select id
  from public.profiles
  where system_role = 'superadmin'
  order by created_at
  limit 1
) profile
where p.acronym in ('AMIA', '4K')
on conflict (program_id, user_id) do update
set role = excluded.role;

-- Optional: assign an already-created Auth user as AMIA program admin and 4K viewer.
-- Replace the email below with a real program-admin account created in Supabase Auth.
-- This does not create an Auth account or set/change its password.
insert into public.program_members (program_id, user_id, role)
select p.id, profile.id,
       case when p.acronym = 'AMIA' then 'program_admin' else 'viewer' end
from public.programs p
cross join lateral (
  select id
  from public.profiles
  where lower(email) = lower('replace-with-existing-program-admin-email@example.com')
  order by created_at
  limit 1
) profile
where p.acronym in ('AMIA', '4K')
  and not exists (
    select 1 from public.profiles superadmin
    where superadmin.id = profile.id and superadmin.system_role = 'superadmin'
  )
on conflict (program_id, user_id) do nothing;

-- Sample activities use existing or newly seeded program workflows.
insert into public.program_activities (
  program_id, activity_code, title, location, start_date, target_end_date,
  approved_budget, recorded_spending, activity_design, status,
  current_step_id, current_sub_step, step_remarks, completed_sub_steps
)
select p.id, sample.activity_code, sample.title, sample.location,
       sample.start_date::date, sample.target_end_date::date,
       sample.approved_budget, sample.recorded_spending,
       sample.activity_design, sample.status, current_step.id,
       sample.current_sub_step, sample.step_remarks::jsonb, sample.completed_sub_steps::jsonb
from public.programs p
join (values
  ('AMIA', 'DEMO-AMIA-2026-001', 'DEMO - Climate-smart vegetable production training', 'La Trinidad, Benguet', '2026-10-12', '2026-10-14', 485000::numeric, 0::numeric, 'Fictional demonstration activity for finance, procurement, and workflow testing.', 'Procurement', 'Activity Procurement', 'Prepare purchase request', '{}'::text, '{}'::text),
  ('AMIA', 'DEMO-AMIA-2026-002', 'DEMO - Rainwater harvesting field implementation', 'Kiangan, Ifugao', '2026-11-02', '2026-11-20', 720000::numeric, 125000::numeric, 'Fictional demonstration activity for activity progress and expenditure tracking.', 'Fund Allocation & Obligation', 'Fund Allocation & Obligation', 'Confirm fund availability', '{}'::text, '{}'::text),
  ('4K', 'DEMO-4K-2026-001', 'DEMO - Indigenous coffee enterprise starter kits', 'Kabugao, Apayao', '2026-10-05', '2026-12-18', 640000::numeric, 85000::numeric, 'Fictional demonstration activity for supplier and delivery tracking.', 'Procurement', 'Procurement of Inputs / Services', 'Prepare purchase request', '{}'::text, '{}'::text),
  ('4K', 'DEMO-4K-2026-002', 'DEMO - Community vegetable processing workshop', 'Bangued, Abra', '2026-09-10', '2026-09-25', 310000::numeric, 278000::numeric, 'Fictional completed activity for liquidation and savings examples.', 'Completed', 'Liquidation & Savings Recording', 'Record savings', '{}'::text, '{}'::text)
) as sample(acronym, activity_code, title, location, start_date, target_end_date, approved_budget, recorded_spending, activity_design, status, current_step_title, current_sub_step, step_remarks, completed_sub_steps)
  on sample.acronym = p.acronym
left join lateral (
  select ws.id
  from public.workflow_steps ws
  where ws.program_id = p.id and ws.title = sample.current_step_title
  order by ws.step_order
  limit 1
) current_step on true
where p.acronym in ('AMIA', '4K')
on conflict (program_id, activity_code) do update set
  title = excluded.title,
  location = excluded.location,
  start_date = excluded.start_date,
  target_end_date = excluded.target_end_date,
  approved_budget = excluded.approved_budget,
  recorded_spending = excluded.recorded_spending,
  activity_design = excluded.activity_design,
  status = excluded.status,
  current_step_id = excluded.current_step_id,
  current_sub_step = excluded.current_sub_step,
  step_remarks = excluded.step_remarks,
  completed_sub_steps = excluded.completed_sub_steps;

-- Workflow event history for each seeded activity and its program's workflow.
insert into public.activity_timeline_events (
  activity_id, workflow_step_id, status, notes, started_at, completed_at
)
select a.id, ws.id,
       case
         when ws.step_order < current_ws.step_order then 'Completed'
         when ws.id = current_ws.id then 'In Progress'
         else 'Pending'
       end,
       'DEMO ONLY - Sample workflow event; not an official record.',
       case when ws.step_order <= current_ws.step_order then now() - make_interval(days => greatest(current_ws.step_order - ws.step_order, 0) * 2) else null end,
       case when ws.step_order < current_ws.step_order then now() - make_interval(days => (current_ws.step_order - ws.step_order) * 2) else null end
from public.program_activities a
join public.programs p on p.id = a.program_id
join public.workflow_steps current_ws on current_ws.id = a.current_step_id
join public.workflow_steps ws on ws.program_id = a.program_id
where a.activity_code like 'DEMO-%'
  and not exists (
    select 1 from public.activity_timeline_events existing
    where existing.activity_id = a.id
      and existing.workflow_step_id = ws.id
      and existing.notes = 'DEMO ONLY - Sample workflow event; not an official record.'
  );

-- Fictional program applications; these records are separate from activity records.
insert into public.program_applications (
  program_id, reference_no, applicant_name, beneficiary_data,
  current_step_id, status, submitted_at, completed_at
)
select p.id, sample.reference_no, sample.applicant_name, sample.beneficiary_data::jsonb,
       ws.id, sample.status, sample.submitted_at::timestamptz, sample.completed_at::timestamptz
from public.programs p
join (values
  ('AMIA', 'DEMO-APP-AMIA-2026-001', 'DEMO - Sample Farmer Cooperative', '{"municipality":"La Trinidad","province":"Benguet","beneficiary_count":24,"organization_type":"Farmer cooperative"}'::text, 'Fund Allocation & Obligation', 'In Progress', '2026-09-01 09:00:00+08', null::text),
  ('AMIA', 'DEMO-APP-AMIA-2026-002', 'DEMO - Sample Irrigators Association', '{"municipality":"Kiangan","province":"Ifugao","beneficiary_count":18,"organization_type":"Irrigators association"}'::text, 'Activity Procurement', 'In Progress', '2026-09-05 10:30:00+08', null::text),
  ('4K', 'DEMO-APP-4K-2026-001', 'DEMO - Sample Indigenous Peoples Organization', '{"municipality":"Kabugao","province":"Apayao","beneficiary_count":20,"enterprise":"Coffee"}'::text, 'Enterprise Activity Planning', 'Completed', '2026-08-15 08:15:00+08', '2026-09-10 16:00:00+08')
) as sample(acronym, reference_no, applicant_name, beneficiary_data, current_step_title, status, submitted_at, completed_at)
  on sample.acronym = p.acronym
left join lateral (
  select step.id from public.workflow_steps step
  where step.program_id = p.id and step.title = sample.current_step_title
  order by step.step_order limit 1
) ws on true
where p.acronym in ('AMIA', '4K')
on conflict (reference_no) do update set
  program_id = excluded.program_id,
  applicant_name = excluded.applicant_name,
  beneficiary_data = excluded.beneficiary_data,
  current_step_id = excluded.current_step_id,
  status = excluded.status,
  submitted_at = excluded.submitted_at,
  completed_at = excluded.completed_at;

-- Step records for each seeded application, reusing the existing workflow steps.
insert into public.application_step_records (
  application_id, workflow_step_id, status, notes, attachments, started_at, completed_at
)
select application.id, ws.id,
       case
         when ws.step_order < current_ws.step_order or application.status = 'Completed' then 'Completed'
         when ws.id = current_ws.id then 'In Progress'
         else 'Pending'
       end,
       'DEMO ONLY - Sample application step; not an official record.',
       '[]'::jsonb,
       case when ws.step_order <= current_ws.step_order then application.submitted_at + make_interval(days => greatest(ws.step_order - 1, 0) * 2) else null end,
       case when ws.step_order < current_ws.step_order or application.status = 'Completed'
         then application.submitted_at + make_interval(days => ws.step_order * 2)
         else null end
from public.program_applications application
join public.workflow_steps current_ws on current_ws.id = application.current_step_id
join public.workflow_steps ws on ws.program_id = application.program_id
where application.reference_no like 'DEMO-%'
on conflict (application_id, workflow_step_id) do update set
  status = excluded.status,
  notes = excluded.notes,
  attachments = excluded.attachments,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at;

-- Annual appropriations and utilization. Every fiscal year/source is its own row.
insert into public.program_annual_allocations (
  program_id, fiscal_year, fund_source, allotment_reference, obligation_reference,
  disbursement_reference, appropriation, allotment_received, obligations,
  disbursements, accounts_payable, cash_advances, liquidation, savings, remarks
)
select p.id, sample.fiscal_year, sample.fund_source, sample.allotment_reference,
       sample.obligation_reference, sample.disbursement_reference,
       sample.appropriation, sample.allotment_received, sample.obligations,
       sample.disbursements, sample.accounts_payable, sample.cash_advances,
       sample.liquidation, sample.savings, sample.remarks
from public.programs p
join (values
  ('AMIA', 2025, 'DEMO ONLY - General Appropriations Act (GAA)', 'DEMO-SARO-AMIA-2025', 'DEMO-ORS-AMIA-2025', 'DEMO-DV-AMIA-2025', 1800000::numeric, 1650000::numeric, 1420000::numeric, 1190000::numeric, 145000::numeric, 35000::numeric, 118000::numeric, 42000::numeric, 'Fictional FY2025 closing balances.'),
  ('AMIA', 2026, 'DEMO ONLY - General Appropriations Act (GAA)', 'DEMO-SARO-AMIA-2026', 'DEMO-ORS-AMIA-2026', 'DEMO-DV-AMIA-2026', 2500000::numeric, 2100000::numeric, 1280000::numeric, 960000::numeric, 180000::numeric, 80000::numeric, 65000::numeric, 25000::numeric, 'Fictional FY2026 figures for finance-page testing.'),
  ('AMIA', 2026, 'DEMO ONLY - Continuing Appropriation', 'DEMO-SARO-CONT-AMIA-2026', 'DEMO-ORS-CONT-AMIA-2026', 'DEMO-DV-CONT-AMIA-2026', 450000::numeric, 400000::numeric, 125000::numeric, 80000::numeric, 20000::numeric, 0::numeric, 0::numeric, 0::numeric, 'Fictional continuing appropriation example.'),
  ('4K', 2026, 'DEMO ONLY - General Appropriations Act (GAA)', 'DEMO-SARO-4K-2026', 'DEMO-ORS-4K-2026', 'DEMO-DV-4K-2026', 1900000::numeric, 1750000::numeric, 1035000::numeric, 780000::numeric, 165000::numeric, 45000::numeric, 130000::numeric, 38000::numeric, 'Fictional FY2026 figures for finance-page testing.')
) as sample(acronym, fiscal_year, fund_source, allotment_reference, obligation_reference, disbursement_reference, appropriation, allotment_received, obligations, disbursements, accounts_payable, cash_advances, liquidation, savings, remarks)
  on sample.acronym = p.acronym
where p.acronym in ('AMIA', '4K')
on conflict (program_id, fiscal_year, fund_source) do update set
  allotment_reference = excluded.allotment_reference,
  obligation_reference = excluded.obligation_reference,
  disbursement_reference = excluded.disbursement_reference,
  appropriation = excluded.appropriation,
  allotment_received = excluded.allotment_received,
  obligations = excluded.obligations,
  disbursements = excluded.disbursements,
  accounts_payable = excluded.accounts_payable,
  cash_advances = excluded.cash_advances,
  liquidation = excluded.liquidation,
  savings = excluded.savings,
  remarks = excluded.remarks;

-- Multiple fictional suppliers for different categories/packages on one activity.
insert into public.activity_procurement_items (
  program_id, activity_id, category, item_description, supplier_name,
  procurement_method, purchase_order_number, quantity, unit, unit_cost,
  delivery_status, delivery_date
)
select a.program_id, a.id, sample.category, sample.item_description,
       sample.supplier_name, sample.procurement_method, sample.purchase_order_number,
       sample.quantity, sample.unit, sample.unit_cost, sample.delivery_status,
       sample.delivery_date::date
from public.program_activities a
join public.programs p on p.id = a.program_id
join (values
  ('DEMO-AMIA-2026-001', 'Food and catering', 'DEMO - Packed meals for training participants', 'DEMO - Cordillera Sample Caterer', 'DEMO ONLY - Small Value Procurement', 'DEMO-PO-AMIA-001', 90::numeric, 'pax', 480::numeric, 'For procurement', null::text),
  ('DEMO-AMIA-2026-001', 'Venue and lodging', 'DEMO - Training venue and accommodation package', 'DEMO - Mountain View Sample Lodge', 'DEMO ONLY - Small Value Procurement', 'DEMO-PO-AMIA-002', 2::numeric, 'day', 18500::numeric, 'Purchase order issued', '2026-10-01'),
  ('DEMO-AMIA-2026-001', 'Transport and freight', 'DEMO - Participant transport service', 'DEMO - Highland Sample Transport', 'DEMO ONLY - Small Value Procurement', null::text, 1::numeric, 'lot', 26000::numeric, 'For procurement', null::text),
  ('DEMO-AMIA-2026-001', 'Training and professional services', 'DEMO - Resource person and facilitation services', 'DEMO - Sample Agriculture Training Services', 'DEMO ONLY - Negotiated procurement', null::text, 2::numeric, 'day', 8500::numeric, 'For procurement', null::text),
  ('DEMO-4K-2026-001', 'Farm inputs and materials', 'DEMO - Coffee seedlings and organic inputs', 'DEMO - Apayao Sample Farm Supply', 'DEMO ONLY - Small Value Procurement', 'DEMO-PO-4K-001', 20::numeric, 'kit', 12500::numeric, 'Partially delivered', '2026-11-15'),
  ('DEMO-4K-2026-001', 'Transport and freight', 'DEMO - Delivery of enterprise starter kits', 'DEMO - Northern Sample Hauling', 'DEMO ONLY - Small Value Procurement', null::text, 1::numeric, 'lot', 22000::numeric, 'For procurement', null::text)
) as sample(activity_code, category, item_description, supplier_name, procurement_method, purchase_order_number, quantity, unit, unit_cost, delivery_status, delivery_date)
  on sample.activity_code = a.activity_code
where p.acronym in ('AMIA', '4K')
  and not exists (
    select 1 from public.activity_procurement_items existing
    where existing.activity_id = a.id
      and existing.item_description = sample.item_description
  );

-- Example step-level discussion. Uses the real Superadmin profile created in Auth.
insert into public.activity_comments (activity_id, step_id, author_id, body)
select a.id, ws.id, profile.id, sample.body
from public.program_activities a
join (values
  ('DEMO-AMIA-2026-001', 'Activity Procurement', 'DEMO ONLY - Supplier canvass is being prepared for the catering, venue, and transport packages.'),
  ('DEMO-4K-2026-001', 'Procurement of Inputs / Services', 'DEMO ONLY - Verify seedling specifications and delivery schedule before issuing the purchase order.')
) as sample(activity_code, step_title, body) on sample.activity_code = a.activity_code
join public.workflow_steps ws on ws.program_id = a.program_id and ws.title = sample.step_title
cross join lateral (
  select id from public.profiles
  where system_role = 'superadmin'
  order by created_at
  limit 1
) profile
where not exists (
  select 1 from public.activity_comments existing
  where existing.activity_id = a.id and existing.body = sample.body
);

-- Clearly marked demo audit rows; normal trigger-generated audit records remain intact.
insert into public.audit_logs (program_id, actor_id, action, entity_type, details)
select p.id, profile.id, 'DEMO SEED', 'demo_finance_procurement',
       jsonb_build_object('demo_seed', true, 'description', 'Fictional data seeded for application demonstration only.')
from public.programs p
cross join lateral (
  select id from public.profiles
  where system_role = 'superadmin'
  order by created_at
  limit 1
) profile
where p.acronym in ('AMIA', '4K')
  and not exists (
    select 1 from public.audit_logs existing
    where existing.program_id = p.id
      and existing.action = 'DEMO SEED'
      and existing.entity_type = 'demo_finance_procurement'
      and existing.details->>'demo_seed' = 'true'
  );

commit;

-- Verify seeded application tables.
select 'programs' as table_name, count(*) as demo_rows
from public.programs where acronym in ('AMIA', '4K')
union all
select 'workflow_steps', count(*)
from public.workflow_steps ws join public.programs p on p.id = ws.program_id where p.acronym in ('AMIA', '4K')
union all
select 'program_activities', count(*)
from public.program_activities where activity_code like 'DEMO-%'
union all
select 'activity_timeline_events', count(*)
from public.activity_timeline_events where notes = 'DEMO ONLY - Sample workflow event; not an official record.'
union all
select 'program_applications', count(*)
from public.program_applications where reference_no like 'DEMO-%'
union all
select 'application_step_records', count(*)
from public.application_step_records where notes = 'DEMO ONLY - Sample application step; not an official record.'
union all
select 'profiles', count(*)
from public.profiles
union all
select 'program_members', count(*)
from public.program_members m join public.programs p on p.id = m.program_id where p.acronym in ('AMIA', '4K')
union all
select 'activity_comments', count(*)
from public.activity_comments where body like 'DEMO ONLY -%'
union all
select 'audit_logs', count(*)
from public.audit_logs where action = 'DEMO SEED' and entity_type = 'demo_finance_procurement'
union all
select 'program_annual_allocations', count(*)
from public.program_annual_allocations where fund_source like 'DEMO ONLY -%'
union all
select 'activity_procurement_items', count(*)
from public.activity_procurement_items where item_description like 'DEMO -%';
