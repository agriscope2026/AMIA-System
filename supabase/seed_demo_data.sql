-- Optional APP-first sample dataset for a NON-PRODUCTION Supabase project.
-- Apply the migrations, including the latest app_activity_calendar migration,
-- before running this script in the Supabase SQL Editor.
-- This seed is additive and rerunnable; it does not delete existing records.
-- All program names, projects, dates, and financial amounts are fictional.

begin;

do $$
begin
  if not exists (select 1 from public.programs where acronym = 'AMIA')
     or not exists (select 1 from public.programs where acronym = '4K') then
    raise exception 'Apply the baseline migrations that create the AMIA and 4K program records first.';
  end if;
end;
$$;

insert into public.program_procurement_plans (
  program_id, fiscal_year, plan_type, is_continuing, plan_status, version_no
)
select program.id, 2026, 'APP', false, 'Indicative', 'Sample FY2026'
from public.programs program
where program.acronym in ('AMIA', '4K')
on conflict (program_id, fiscal_year, plan_type) do update
set is_continuing = excluded.is_continuing,
    plan_status = excluded.plan_status,
    version_no = excluded.version_no;

insert into public.program_annual_allocations (
  program_id, fiscal_year, fund_source, appropriation, allotment_received,
  obligations, disbursements, accounts_payable, cash_advances, liquidation,
  savings, remarks
)
select program.id, 2026, sample.fund_source, sample.appropriation,
       sample.allotment_received, 0, 0, sample.accounts_payable,
       sample.cash_advances, sample.liquidation, sample.savings,
       'Fictional APP-first seed values for testing only.'
from public.programs program
join (values
  ('AMIA', 'DEMO ONLY - General Appropriations Act (GAA)', 2500000::numeric, 2100000::numeric, 180000::numeric, 80000::numeric, 65000::numeric, 25000::numeric),
  ('4K', 'DEMO ONLY - General Appropriations Act (GAA)', 1900000::numeric, 1750000::numeric, 165000::numeric, 45000::numeric, 130000::numeric, 38000::numeric)
) as sample(acronym, fund_source, appropriation, allotment_received, accounts_payable, cash_advances, liquidation, savings)
  on sample.acronym = program.acronym
on conflict (program_id, fiscal_year, fund_source) do update
set appropriation = excluded.appropriation,
    allotment_received = excluded.allotment_received,
    obligations = excluded.obligations,
    disbursements = excluded.disbursements,
    accounts_payable = excluded.accounts_payable,
    cash_advances = excluded.cash_advances,
    liquidation = excluded.liquidation,
    savings = excluded.savings,
    remarks = excluded.remarks;

with sample_rows (
  acronym, project_title, implementing_unit, project_description,
  procurement_mode, early_procurement_activity, bid_evaluation_criteria,
  procurement_start, procurement_end, source_of_fund, estimated_budget,
  procurement_strategy, remarks
) as (
  values
    (
      'AMIA',
      'Climate-Resilient Vegetable Production Training',
      'AMIA Program Unit',
      'Training and field demonstrations for climate-resilient vegetable production.',
      'Small Value Procurement',
      true,
      'Technical compliance, delivery schedule, and total evaluated cost',
      date '2026-10-01',
      date '2026-12-01',
      'General Appropriations Act (GAA)',
      485000::numeric,
      'Combined procurement of training supplies and services',
      'Sample project for APP-to-activity and calendar testing.'
    ),
    (
      'AMIA',
      'Rainwater Harvesting System Installation',
      'Field Operations Unit',
      'Install and document community rainwater harvesting systems.',
      'Competitive Bidding',
      false,
      'Technical specifications, warranty, and evaluated price',
      date '2026-11-01',
      date '2026-12-01',
      'General Appropriations Act (GAA)',
      720000::numeric,
      'Package installation and commissioning services',
      'Sample project for annual totals and multi-activity calendar testing.'
    ),
    (
      '4K',
      'Indigenous Coffee Enterprise Starter Kits',
      '4K Program Unit',
      'Procure and distribute coffee seedlings and organic farm inputs to participating enterprises.',
      'Small Value Procurement',
      false,
      'Seedling quality, delivery coverage, and total evaluated cost',
      date '2026-10-01',
      date '2026-12-01',
      'General Appropriations Act (GAA)',
      640000::numeric,
      'Lot-based procurement with staged delivery',
      'Sample project for the 4K APP and activity workspace.'
    ),
    (
      'AMIA',
      'Community Seed Bank Feasibility Assessment',
      'AMIA Program Unit',
      'Assess community seed storage needs and prepare an implementation proposal.',
      'Small Value Procurement',
      false,
      'Relevant experience, assessment approach, and total evaluated cost',
      null::date,
      null::date,
      'General Appropriations Act (GAA)',
      165000::numeric,
      'Procure assessment services after the schedule is approved',
      'Unscheduled example; enter procurement months in APP when confirmed.'
    )
)
insert into public.program_procurement_plan_items (
  plan_id, project_title, implementing_unit, project_description,
  procurement_mode, early_procurement_activity, bid_evaluation_criteria,
  procurement_start, procurement_end, source_of_fund, estimated_budget,
  procurement_strategy, remarks
)
select plan.id, sample.project_title, sample.implementing_unit,
       sample.project_description, sample.procurement_mode,
       sample.early_procurement_activity, sample.bid_evaluation_criteria,
       sample.procurement_start, sample.procurement_end,
       sample.source_of_fund, sample.estimated_budget,
       sample.procurement_strategy, sample.remarks
from sample_rows sample
join public.programs program on program.acronym = sample.acronym
join public.program_procurement_plans plan
  on plan.program_id = program.id
 and plan.fiscal_year = 2026
 and plan.plan_type = 'APP'
where not exists (
  select 1
  from public.program_procurement_plan_items existing
  where existing.plan_id = plan.id
    and existing.project_title = sample.project_title
);

commit;

select program.acronym,
       plan.fiscal_year,
       count(item.id) as app_projects,
       count(item.activity_id) as linked_activities,
       coalesce(sum(item.estimated_budget), 0) as app_planned_budget
from public.programs program
left join public.program_procurement_plans plan
  on plan.program_id = program.id
 and plan.plan_type = 'APP'
 and plan.fiscal_year = 2026
left join public.program_procurement_plan_items item on item.plan_id = plan.id
where program.acronym in ('AMIA', '4K')
group by program.acronym, plan.fiscal_year
order by program.acronym;
