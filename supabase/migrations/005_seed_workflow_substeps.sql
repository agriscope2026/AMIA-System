update public.workflow_steps as ws
set sub_steps = seeded.sub_steps::jsonb,
    updated_at = now()
from (
  values
    ('AMIA', 1, '["Define activity scope", "Identify beneficiaries and outputs", "Prepare work and financial plan"]'),
    ('AMIA', 2, '["Confirm fund availability", "Prepare obligation request", "Record approved obligation"]'),
    ('AMIA', 3, '["Prepare purchase request", "Conduct canvass or bidding", "Evaluate quotations", "Prepare procurement recommendation"]'),
    ('AMIA', 4, '["Finalize BAC resolution", "Issue purchase order or contract", "Notify supplier or service provider"]'),
    ('AMIA', 5, '["Receive delivery", "Inspect goods or services", "Prepare acceptance report"]'),
    ('AMIA', 6, '["Prepare implementation arrangements", "Conduct activity and distribution", "Document attendance and outputs", "Obtain beneficiary acknowledgement"]'),
    ('AMIA', 7, '["Prepare accomplishment report", "Compile financial documents", "Submit liquidation documents"]'),
    ('AMIA', 8, '["Reconcile actual expenditures", "Record savings", "Process fund reversion or realignment"]'),
    ('4K', 1, '["Define enterprise activity", "Validate beneficiaries", "Prepare implementation schedule"]'),
    ('4K', 2, '["Confirm fund availability", "Prepare obligation request", "Record approved obligation"]'),
    ('4K', 3, '["Prepare purchase request", "Conduct canvass or bidding", "Evaluate offers", "Recommend supplier or service provider"]'),
    ('4K', 4, '["Receive delivery", "Inspect inputs or equipment", "Prepare inspection and acceptance report"]'),
    ('4K', 5, '["Confirm qualified beneficiaries", "Release assistance", "Conduct enterprise activity", "Document beneficiary acknowledgement"]'),
    ('4K', 6, '["Monitor enterprise progress", "Validate outputs", "Prepare accomplishment report"]'),
    ('4K', 7, '["Compile liquidation documents", "Reconcile actual cost", "Record savings"]')
) as seeded(acronym, step_order, sub_steps)
join public.programs as p on p.acronym = seeded.acronym
where ws.program_id = p.id
  and ws.step_order = seeded.step_order
  and (ws.sub_steps is null or jsonb_array_length(ws.sub_steps) = 0);
