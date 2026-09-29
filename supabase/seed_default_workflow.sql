-- Restore any missing default workflow steps for the AMIA and 4K programs.
-- Run after the database migrations and after the AMIA / 4K program rows exist.
-- This script is additive: it never updates or replaces an existing workflow step.

begin;

do $$
begin
  if not exists (select 1 from public.programs where acronym = 'AMIA')
     or not exists (select 1 from public.programs where acronym = '4K') then
    raise exception 'Create or restore the AMIA and 4K program records before running this workflow seed.';
  end if;
end;
$$;

with default_steps (
  acronym, step_order, title, description, sub_steps,
  assigned_role, required_documents, sla_days, status_tag
) as (
  values
    ('AMIA', 1, 'Activity Proposal & Work Plan', 'Define the activity, beneficiaries, outputs, schedule, and cost estimates.', '["Define activity scope", "Identify beneficiaries and outputs", "Prepare work and financial plan"]'::jsonb, 'AMIA Program Unit', '["Activity proposal", "Work and financial plan"]'::jsonb, 5, 'Completed'),
    ('AMIA', 2, 'Fund Allocation & Obligation', 'Confirm available allotment and record the obligation against the approved activity budget.', '["Confirm fund availability", "Prepare obligation request", "Record approved obligation"]'::jsonb, 'Budget and Finance Division', '["Obligation request", "Budget utilization request"]'::jsonb, 4, 'In Progress'),
    ('AMIA', 3, 'Activity Procurement', 'Prepare the purchase request, canvass or bidding documents, and procurement recommendation.', '["Prepare purchase request", "Conduct canvass or bidding", "Evaluate quotations", "Prepare procurement recommendation"]'::jsonb, 'Procurement Management Unit', '["Purchase request", "Canvass", "Abstract of quotations"]'::jsonb, 10, 'Pending'),
    ('AMIA', 4, 'Purchase Order / Contract Award', 'Issue the purchase order or contract and notify the selected supplier or service provider.', '["Finalize BAC resolution", "Issue purchase order or contract", "Notify supplier or service provider"]'::jsonb, 'BAC Secretariat / Supply Office', '["BAC resolution", "Purchase order", "Contract"]'::jsonb, 5, 'Pending'),
    ('AMIA', 5, 'Delivery, Inspection & Acceptance', 'Verify delivered goods or completed services against the approved specifications and activity plan.', '["Receive delivery", "Inspect goods or services", "Prepare acceptance report"]'::jsonb, 'Inspection and Acceptance Committee', '["Delivery receipt", "Inspection report", "Acceptance report"]'::jsonb, 7, 'Pending'),
    ('AMIA', 6, 'Activity Implementation & Distribution', 'Conduct the approved activity and document distribution, attendance, outputs, and beneficiary acknowledgement.', '["Prepare implementation arrangements", "Conduct activity and distribution", "Document attendance and outputs", "Obtain beneficiary acknowledgement"]'::jsonb, 'AMIA Field Operations Team', '["Attendance sheet", "Distribution list", "Photo documentation"]'::jsonb, 15, 'Pending'),
    ('AMIA', 7, 'Accomplishment & Liquidation', 'Submit the accomplishment report and supporting financial documents for liquidation and payment recording.', '["Prepare accomplishment report", "Compile financial documents", "Submit liquidation documents"]'::jsonb, 'AMIA Program Unit / Finance', '["Accomplishment report", "Disbursement voucher", "Receipts"]'::jsonb, 10, 'Pending'),
    ('AMIA', 8, 'Savings & Fund Reversion', 'Reconcile actual expenditures against the obligation, record savings, and process fund reversion or realignment.', '["Reconcile actual expenditures", "Record savings", "Process fund reversion or realignment"]'::jsonb, 'Finance and Accounting Division', '["Obligation reconciliation", "Savings report", "Reversion document"]'::jsonb, 7, 'Pending'),
    ('4K', 1, 'Enterprise Activity Planning', 'Identify the livelihood enterprise, beneficiaries, outputs, and approved implementation schedule.', '["Define enterprise activity", "Validate beneficiaries", "Prepare implementation schedule"]'::jsonb, '4K Program Unit', '["Enterprise proposal", "Beneficiary profile"]'::jsonb, 7, 'Completed'),
    ('4K', 2, 'Fund Availability & Obligation', 'Validate the program allocation and record the approved obligation for the enterprise activity.', '["Confirm fund availability", "Prepare obligation request", "Record approved obligation"]'::jsonb, 'Budget and Finance Division', '["Work and financial plan", "Obligation request"]'::jsonb, 5, 'In Progress'),
    ('4K', 3, 'Procurement of Inputs / Services', 'Procure farm inputs, equipment, or services based on the approved enterprise plan and specifications.', '["Prepare purchase request", "Conduct canvass or bidding", "Evaluate offers", "Recommend supplier or service provider"]'::jsonb, 'Procurement Management Unit', '["Purchase request", "Canvass or bidding documents"]'::jsonb, 12, 'Pending'),
    ('4K', 4, 'Inspection & Acceptance', 'Inspect the procured inputs or equipment and confirm quantity, quality, and compliance.', '["Receive delivery", "Inspect inputs or equipment", "Prepare inspection and acceptance report"]'::jsonb, 'Inspection and Acceptance Committee', '["Delivery receipt", "Inspection and acceptance report"]'::jsonb, 7, 'Pending'),
    ('4K', 5, 'Release & Enterprise Implementation', 'Release assistance to qualified beneficiaries and carry out the approved enterprise activity.', '["Confirm qualified beneficiaries", "Release assistance", "Conduct enterprise activity", "Document beneficiary acknowledgement"]'::jsonb, '4K Field Operations Team', '["Release form", "Beneficiary acknowledgement", "Activity photos"]'::jsonb, 15, 'Pending'),
    ('4K', 6, 'Monitoring & Accomplishment', 'Monitor enterprise progress, validate outputs, and submit the physical and financial accomplishment report.', '["Monitor enterprise progress", "Validate outputs", "Prepare accomplishment report"]'::jsonb, 'Planning and Monitoring Division', '["Monitoring report", "Accomplishment report"]'::jsonb, 20, 'Pending'),
    ('4K', 7, 'Liquidation & Savings Recording', 'Complete liquidation, reconcile actual cost, and record any unused balance as savings.', '["Compile liquidation documents", "Reconcile actual cost", "Record savings"]'::jsonb, '4K Program Unit / Finance', '["Liquidation report", "Receipts", "Savings reconciliation"]'::jsonb, 10, 'Pending')
)
insert into public.workflow_steps (
  program_id, step_order, title, description, sub_steps,
  assigned_role, required_documents, sla_days, status_tag,
  is_optional, is_active
)
select program.id, defaults.step_order, defaults.title, defaults.description,
       defaults.sub_steps, defaults.assigned_role, defaults.required_documents,
       defaults.sla_days, defaults.status_tag, false, true
from default_steps defaults
join public.programs program on program.acronym = defaults.acronym
where not exists (
  select 1
  from public.workflow_steps existing
  where existing.program_id = program.id
    and existing.step_order = defaults.step_order
);

commit;

select program.acronym, count(step.id) as workflow_steps
from public.programs program
left join public.workflow_steps step on step.program_id = program.id and step.is_active
where program.acronym in ('AMIA', '4K')
group by program.acronym
order by program.acronym;
