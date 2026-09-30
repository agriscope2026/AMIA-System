import { createClient } from "@supabase/supabase-js";

export type DatabaseWorkflowStep = {
  id: string;
  program_id: string;
  step_order: number;
  title: string;
  description: string | null;
  sub_steps: string[];
  assigned_role: string;
  required_documents: string[];
  sla_days: number;
  status_tag: "Pending" | "In Progress" | "Completed" | "For Revision";
  is_optional: boolean;
  is_active: boolean;
};

export type DatabaseProgram = {
  id: string;
  title: string;
  acronym: string;
  agency_title: string;
  office_subtitle: string | null;
  description: string | null;
  target_beneficiaries: string | null;
  operating_units: string[];
  logo_url: string | null;
  theme_color: string;
  accent_color: string;
  is_active: boolean;
};

export type DatabaseActivity = {
  id: string;
  program_id: string;
  activity_code: string;
  title: string;
  location: string | null;
  start_date: string | null;
  target_end_date: string | null;
  fiscal_year: number | null;
  approved_budget: number;
  recorded_spending: number;
  unitemized_obligations: number;
  activity_design: string | null;
  status: string;
  current_step_id: string | null;
  current_sub_step: string | null;
  step_remarks: Record<string, string>;
  completed_sub_steps: Record<string, string[]>;
};

export type AnnualProgramAllocation = {
  id: string;
  program_id: string;
  fiscal_year: number;
  fund_source: string;
  allotment_reference: string | null;
  obligation_reference: string | null;
  disbursement_reference: string | null;
  appropriation: number;
  allotment_received: number;
  obligations: number;
  disbursements: number;
  accounts_payable: number;
  cash_advances: number;
  liquidation: number;
  savings: number;
  remarks: string | null;
};

export type ProcurementPlanType = "APP" | "WFP" | "PPMP";
export type ProcurementPlanSheet = {
  id: string;
  program_id: string;
  fiscal_year: number;
  plan_type: ProcurementPlanType;
  is_continuing: boolean;
  plan_status: "Indicative" | "Final";
  version_no: string;
  created_at: string;
  updated_at: string;
};
export type ProcurementPlanItem = {
  id: string;
  plan_id: string;
  activity_id: string | null;
  row_order: number;
  version: number;
  deleted_at: string | null;
  project_title: string;
  implementing_unit: string;
  project_description: string;
  procurement_mode: string;
  early_procurement_activity: boolean;
  bid_evaluation_criteria: string;
  procurement_start: string | null;
  procurement_end: string | null;
  source_of_fund: string;
  estimated_budget: string | number;
  procurement_strategy: string;
  remarks: string;
  created_at: string;
  updated_at: string;
  custom_values?: Record<string, unknown>;
  formula_values: Record<string, string>;
};

export function financeGridCustomValues(item: ProcurementPlanItem) {
  return {
    ...(item.custom_values ?? {}),
    ...Object.fromEntries(Object.entries(item.formula_values ?? {}).map(([key, formula]) => [`__formula__${key}`, formula])),
  };
}

export type ProcurementItem = {
  id: string;
  program_id: string;
  activity_id: string;
  category: string;
  item_description: string;
  supplier_name: string;
  procurement_method: string;
  purchase_order_number: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  workflow_step_id: string | null;
  obligated_amount: number;
  obligation_status: "Not obligated" | "Partially obligated" | "Obligated" | "Cancelled";
  delivery_status: string;
  delivery_date: string | null;
};

export type FinanceSheetType = ProcurementPlanType;
export type FinanceSheetCustomColumn = {
  id: string;
  label: string;
  type: "text" | "number" | "date";
  bold?: boolean;
  color?: string;
  background?: string;
  numberFormat?: "default" | "currency" | "percent";
};
export type FinanceSheetPreferences = {
  id: string;
  program_id: string;
  fiscal_year: number;
  sheet_type: FinanceSheetType;
  custom_columns: FinanceSheetCustomColumn[];
  view_options: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BeneficiaryRecord = {
  id: string;
  program_id: string;
  beneficiary_name: string | null;
  beneficiary_acronym: string | null;
  fca_category: string | null;
  membership_count: number | null;
  contact_person: string | null;
  contact_number: string | null;
  additional_details: string | null;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
  other_assistance_interventions: string | null;
  activity_ids: string[];
  created_at: string;
  updated_at: string;
};

export type CalendarDayNote = {
  program_id: string;
  note_date: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type AppProfile = { id: string; full_name: string; email: string; system_role?: "superadmin" | "user" };
export type ProgramMember = { id: string; program_id: string; user_id: string; role: "program_admin" | "editor" | "viewer"; profile?: AppProfile };
export type ActivityComment = { id: string; activity_id: string; step_id: string | null; parent_id: string | null; author_id: string; body: string; created_at: string; author?: AppProfile };
export type AuditLog = { id: string; program_id: string | null; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string; actor?: AppProfile };

const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const databaseConfigured = Boolean(url && anonKey && !url.includes("your-project") && !anonKey.startsWith("your-"));
const supabase = databaseConfigured ? createClient(url, anonKey) : null;

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export async function loadPrograms() {
  const client = requireClient();
  const { data, error } = await client.from("programs").select("*").eq("is_active", true).order("created_at");
  if (error) throw error;
  return (data ?? []) as DatabaseProgram[];
}

export async function loadWorkflowSteps(programId: string) {
  const client = requireClient();
  const { data, error } = await client.from("workflow_steps").select("*").eq("program_id", programId).order("step_order");
  if (error) throw error;
  return (data ?? []) as DatabaseWorkflowStep[];
}

export async function reorderWorkflowSteps(programId: string, stepIds: string[]) {
  const { error } = await requireClient().rpc("reorder_program_workflow_steps", {
    target_program_id: programId,
    ordered_step_ids: stepIds,
  });
  if (error) throw error;
}

export async function loadActivities(programId: string) {
  const client = requireClient();
  const { data, error } = await client.from("program_activities").select("*").eq("program_id", programId).order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DatabaseActivity[];
}

export async function loadAnnualAllocations(programId: string) {
  const { data, error } = await requireClient().from("program_annual_allocations")
    .select("*").eq("program_id", programId).order("fiscal_year", { ascending: false }).order("fund_source");
  if (error) throw error;
  return (data ?? []) as AnnualProgramAllocation[];
}

export async function saveAnnualAllocation(values: Partial<AnnualProgramAllocation> & Pick<AnnualProgramAllocation, "program_id" | "fiscal_year" | "fund_source">) {
  const { id, ...fields } = values;
  const query = id
    ? requireClient().from("program_annual_allocations").update(fields).eq("id", id).select().single()
    : requireClient().from("program_annual_allocations").insert(fields).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data as AnnualProgramAllocation;
}

export async function loadFinanceSheetPreferences(programId: string, fiscalYear: number, sheetType: FinanceSheetType) {
  const { data, error } = await requireClient().from("program_finance_sheet_preferences")
    .select("*").eq("program_id", programId).eq("fiscal_year", fiscalYear).eq("sheet_type", sheetType).maybeSingle();
  if (error) throw error;
  return (data ?? null) as FinanceSheetPreferences | null;
}

export async function saveFinanceSheetPreferences(values: Pick<FinanceSheetPreferences, "program_id" | "fiscal_year" | "sheet_type" | "custom_columns" | "view_options">) {
  if (new TextEncoder().encode(JSON.stringify(values.view_options)).byteLength > 1048576) {
    throw new Error("Financial sheet settings cannot exceed 1 MiB.");
  }
  if (new TextEncoder().encode(JSON.stringify(values.custom_columns)).byteLength > 262144) {
    throw new Error("Financial column settings cannot exceed 256 KiB.");
  }
  const { data, error } = await requireClient().from("program_finance_sheet_preferences")
    .upsert(values, { onConflict: "program_id,fiscal_year,sheet_type" }).select().single();
  if (error) throw error;
  return data as FinanceSheetPreferences;
}

export async function loadFinanceProcurementItems(programId: string, activityIds: string[]) {
  if (!activityIds.length) return [] as ProcurementItem[];
  const { data, error } = await requireClient().from("activity_procurement_items")
    .select("*").eq("program_id", programId).in("activity_id", activityIds).order("created_at");
  if (error) throw error;
  return (data ?? []) as ProcurementItem[];
}

export async function deleteAnnualAllocation(id: string) {
  const { error } = await requireClient().from("program_annual_allocations").delete().eq("id", id);
  if (error) throw error;
}

export async function loadProcurementPlanSheet(programId: string, fiscalYear: number, planType: ProcurementPlanType) {
  const client = requireClient();
  const { data: sheet, error: sheetError } = await client.from("program_procurement_plans")
    .select("*").eq("program_id", programId).eq("fiscal_year", fiscalYear).eq("plan_type", planType).maybeSingle();
  if (sheetError) throw sheetError;
  if (!sheet) return { sheet: null, items: [] as ProcurementPlanItem[] };
  const items: ProcurementPlanItem[] = [];
  for (let pageOffset = 0; ; pageOffset += 250) {
    const page = await loadProcurementPlanPage(sheet.id, { pageSize: 250, pageOffset });
    items.push(...page);
    if (page.length < 250) break;
  }
  return { sheet: sheet as ProcurementPlanSheet, items };
}

export async function loadProcurementPlanPage(
  planId: string,
  options: {
    pageSize?: number;
    pageOffset?: number;
    searchText?: string;
    sortKey?: "row_order" | "project_title" | "implementing_unit" | "estimated_budget" | "procurement_start" | "procurement_end" | "updated_at";
    sortDirection?: "asc" | "desc";
  } = {},
) {
  const { data, error } = await requireClient().rpc("finance_page_plan_items", {
    target_plan_id: planId,
    page_size: options.pageSize ?? 100,
    page_offset: options.pageOffset ?? 0,
    search_text: options.searchText?.trim() || null,
    sort_key: options.sortKey ?? "row_order",
    sort_direction: options.sortDirection ?? "asc",
  });
  if (error) throw error;
  return (data ?? []) as ProcurementPlanItem[];
}

export async function reorderProcurementPlanItems(planId: string, orderedIds: string[]) {
  const client = requireClient();
  const { error } = await client.rpc("finance_reorder_plan_items", {
    target_plan_id: planId,
    ordered_ids: orderedIds,
  });
  if (error) throw error;
  const { data, error: loadError } = await client.from("program_procurement_plan_items")
    .select("id,row_order,version").eq("plan_id", planId).is("deleted_at", null);
  if (loadError) throw loadError;
  return (data ?? []) as Pick<ProcurementPlanItem, "id" | "row_order" | "version">[];
}

export async function loadProcurementPlanYears(programId: string) {
  const { data, error } = await requireClient().from("program_procurement_plans")
    .select("fiscal_year").eq("program_id", programId);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => Number(row.fiscal_year)))).sort((a, b) => b - a);
}

export async function saveProcurementPlanSheet(values: Pick<ProcurementPlanSheet, "program_id" | "fiscal_year" | "plan_type" | "is_continuing" | "plan_status" | "version_no">) {
  const { data, error } = await requireClient().from("program_procurement_plans")
    .upsert(values, { onConflict: "program_id,fiscal_year,plan_type" }).select().single();
  if (error) throw error;
  return data as ProcurementPlanSheet;
}

export type ProcurementPlanItemSave = Partial<ProcurementPlanItem> & Pick<ProcurementPlanItem, "plan_id">;

function financePlanItemOperation(values: ProcurementPlanItemSave) {
  const { id, version, custom_values: customValues, formula_values: formulaValues } = values;
  if (id && typeof version !== "number") {
    throw new Error("This finance row has no version. Reload the sheet before saving.");
  }
  const separatedValues = splitFinanceCellMetadata(customValues ?? {});
  const allowedFields = [
    "project_title", "implementing_unit", "project_description", "procurement_mode",
    "early_procurement_activity", "bid_evaluation_criteria", "procurement_start",
    "procurement_end", "source_of_fund", "estimated_budget", "procurement_strategy", "remarks",
  ] as const;
  const fields: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in values) fields[field] = values[field];
  }
  return {
    op: id ? "update" : "create",
    ...(id ? { id, expected_version: version } : {}),
    fields: {
      ...fields,
      custom_values: separatedValues.customValues,
      formula_values: { ...separatedValues.formulaValues, ...(formulaValues ?? {}) },
    },
  };
}

export async function saveProcurementPlanItem(values: ProcurementPlanItemSave) {
  const [savedItem] = await saveProcurementPlanItemsBatch(values.plan_id, [values]);
  if (!savedItem) throw new Error("The finance row save returned no database record.");
  return savedItem;
}

export async function saveProcurementPlanItemsBatch(planId: string, values: ProcurementPlanItemSave[]) {
  if (values.length < 1 || values.length > 250) {
    throw new Error("A finance batch must contain between 1 and 250 rows.");
  }
  if (values.some((value) => value.plan_id !== planId)) {
    throw new Error("A finance batch can only update rows in one sheet.");
  }
  const { data, error } = await requireClient().rpc("finance_apply_plan_item_batch", {
    target_plan_id: planId,
    operations: values.map(financePlanItemOperation),
  });
  if (error) throw error;
  return (data ?? []) as ProcurementPlanItem[];
}

export async function deleteProcurementPlanItemsBatch(
  planId: string,
  rows: Array<Pick<ProcurementPlanItem, "id" | "version">>,
) {
  if (rows.length < 1 || rows.length > 250) {
    throw new Error("A finance delete batch must contain between 1 and 250 rows.");
  }
  const { error } = await requireClient().rpc("finance_apply_plan_item_batch", {
    target_plan_id: planId,
    operations: rows.map(({ id, version }) => ({ op: "delete", id, expected_version: version })),
  });
  if (error) throw error;
}

export async function deleteProcurementPlanItem(planId: string, id: string, expectedVersion: number) {
  await deleteProcurementPlanItemsBatch(planId, [{ id, version: expectedVersion }]);
}

function splitFinanceCellMetadata(customValues: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  const formulaValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(customValues)) {
    if (key.startsWith("__formula__")) {
      if (typeof value !== "string" || !value.startsWith("=")) {
        throw new Error(`Invalid saved formula for ${key.slice("__formula__".length)}.`);
      }
      formulaValues[key.slice("__formula__".length)] = value;
    } else {
      values[key] = value;
    }
  }
  return { customValues: values, formulaValues };
}

export async function loadProcurementItems(activityId: string) {
  const { data, error } = await requireClient().from("activity_procurement_items")
    .select("*").eq("activity_id", activityId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ProcurementItem[];
}

export async function saveProcurementItem(values: Partial<ProcurementItem> & Pick<ProcurementItem, "program_id" | "activity_id" | "category" | "item_description" | "supplier_name" | "procurement_method" | "quantity" | "unit" | "unit_cost" | "workflow_step_id" | "obligated_amount" | "obligation_status" | "delivery_status">) {
  const { id, ...fields } = values;
  const query = id
    ? requireClient().from("activity_procurement_items").update(fields).eq("id", id).select().single()
    : requireClient().from("activity_procurement_items").insert(fields).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data as ProcurementItem;
}

export async function deleteProcurementItem(id: string) {
  const { error } = await requireClient().from("activity_procurement_items").delete().eq("id", id);
  if (error) throw error;
}

export async function loadBeneficiaries(programId?: string) {
  const client = requireClient();
  const pageSize = 500;
  const records: BeneficiaryRecord[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from("program_beneficiaries").select("*")
      .order("created_at", { ascending: false }).order("id", { ascending: true });
    if (programId) query = query.eq("program_id", programId);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Omit<BeneficiaryRecord, "activity_ids">[];
    if (page.length) {
      const { data: interventionRows, error: interventionError } = await client
        .from("program_beneficiary_interventions")
        .select("beneficiary_id, activity_id")
        .in("beneficiary_id", page.map((record) => record.id));
      if (interventionError) throw interventionError;
      const activityIdsByBeneficiary = new Map<string, string[]>();
      for (const row of interventionRows ?? []) {
        const activityIds = activityIdsByBeneficiary.get(row.beneficiary_id) ?? [];
        activityIds.push(row.activity_id);
        activityIdsByBeneficiary.set(row.beneficiary_id, activityIds);
      }
      records.push(...page.map((record) => ({
        ...record,
        activity_ids: activityIdsByBeneficiary.get(record.id) ?? [],
      })));
    }
    if (page.length < pageSize) return records;
  }
}

export async function saveBeneficiary(values: Partial<BeneficiaryRecord> & Pick<BeneficiaryRecord, "program_id" | "other_assistance_interventions">) {
  const fields = { ...values };
  const activityIds = fields.activity_ids ?? [];
  delete fields.id;
  delete fields.created_at;
  delete fields.updated_at;
  delete fields.activity_ids;
  const query = values.id
    ? requireClient().from("program_beneficiaries").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", values.id).select().single()
    : requireClient().from("program_beneficiaries").insert(fields).select().single();
  const { data, error } = await query;
  if (error) throw error;
  const beneficiary = data as Omit<BeneficiaryRecord, "activity_ids">;
  const { error: interventionError } = await requireClient().rpc("replace_beneficiary_interventions", {
    target_beneficiary_id: beneficiary.id,
    target_activity_ids: activityIds,
  });
  if (interventionError) {
    throw new Error(`Beneficiary details were saved, but intervention links could not be updated. Reload the register and edit the beneficiary again. ${interventionError.message}`);
  }
  return { ...beneficiary, activity_ids: activityIds } as BeneficiaryRecord;
}

export async function deleteBeneficiary(id: string) {
  const { error } = await requireClient().from("program_beneficiaries").delete().eq("id", id);
  if (error) throw error;
}

export async function loadCalendarDayNotes(programId: string, startDate: string, endDate: string) {
  const { data, error } = await requireClient().from("program_calendar_day_notes").select("*")
    .eq("program_id", programId).gte("note_date", startDate).lte("note_date", endDate).order("note_date");
  if (error) throw error;
  return (data ?? []) as CalendarDayNote[];
}

export async function saveCalendarDayNote(programId: string, noteDate: string, note: string) {
  const client = requireClient();
  if (!note.trim()) {
    const { error } = await client.from("program_calendar_day_notes").delete()
      .eq("program_id", programId).eq("note_date", noteDate);
    if (error) throw error;
    return null;
  }

  const { data, error } = await client.from("program_calendar_day_notes")
    .upsert({ program_id: programId, note_date: noteDate, note: note.trim(), updated_at: new Date().toISOString() }, { onConflict: "program_id,note_date" })
    .select().single();
  if (error) throw error;
  return data as CalendarDayNote;
}

export async function saveCalendarActivitySchedule(activityId: string, programId: string, startDate: string, endDate: string) {
  const client = requireClient();
  const { data: planItem, error: lookupError } = await client.from("program_procurement_plan_items")
    .select("id").eq("activity_id", activityId).maybeSingle();
  if (lookupError) throw lookupError;

  if (planItem) {
    const { error } = await client.from("program_procurement_plan_items")
      .update({ procurement_start: startDate || null, procurement_end: endDate || null, updated_at: new Date().toISOString() })
      .eq("id", planItem.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("program_activities").update({
    start_date: startDate || null,
    target_end_date: endDate || null,
    ...(startDate ? { fiscal_year: Number(startDate.slice(0, 4)) } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", activityId).eq("program_id", programId);
  if (error) throw error;
}

export async function loadAdminDatabaseTables() {
  const client = requireClient();
  const tableNames = ["programs", "workflow_steps", "program_activities", "program_beneficiaries", "program_annual_allocations", "activity_procurement_items", "program_procurement_plans", "program_procurement_plan_items", "profiles", "program_members", "audit_logs"];
  const entries = await Promise.all(tableNames.map(async (tableName) => {
    const { data, error } = await client.from(tableName).select("*").limit(500);
    if (error) throw new Error(`Could not load ${tableName}: ${error.message}`);
    return [tableName, (data ?? []) as Record<string, unknown>[]] as const;
  }));
  return Object.fromEntries(entries) as Record<string, Record<string, unknown>[]>;
}

export async function updateProgram(programId: string, values: Partial<DatabaseProgram>) {
  const client = requireClient();
  const { error } = await client.from("programs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", programId);
  if (error) throw error;
}

export async function createProgram(values: Omit<DatabaseProgram, "id">) {
  const client = requireClient();
  const { data, error } = await client.from("programs").insert(values).select().single();
  if (error) throw error;
  return data as DatabaseProgram;
}

export async function updateWorkflowStep(stepId: string, values: Partial<DatabaseWorkflowStep>) {
  const client = requireClient();
  const { error } = await client.from("workflow_steps").update({ ...values, updated_at: new Date().toISOString() }).eq("id", stepId);
  if (error) throw error;
}

export async function createWorkflowStep(values: Omit<DatabaseWorkflowStep, "id">) {
  const client = requireClient();
  const { data, error } = await client.from("workflow_steps").insert(values).select().single();
  if (error) throw error;
  return data as DatabaseWorkflowStep;
}

export async function updateActivity(activityId: string, values: Partial<DatabaseActivity>) {
  const client = requireClient();
  const { error } = await client.from("program_activities").update({ ...values, updated_at: new Date().toISOString() }).eq("id", activityId);
  if (error) throw error;
}

export async function createActivity(values: Omit<DatabaseActivity, "id">) {
  const client = requireClient();
  const { data, error } = await client.from("program_activities").insert(values).select().single();
  if (error) throw error;
  return data as DatabaseActivity;
}

export async function deleteActivity(activityId: string) {
  const client = requireClient();
  const { error } = await client.from("program_activities").delete().eq("id", activityId);
  if (error) throw error;
}

export async function getAuthSession() {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function subscribeToAuth(callback: (session: Awaited<ReturnType<typeof getAuthSession>>) => void) {
  const client = requireClient();
  return client.auth.onAuthStateChange((_event, session) => callback(session));
}

export async function signIn(email: string, password: string) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email: string, password: string, fullName: string) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function loadProfile(userId: string) {
  const client = requireClient();
  const { data, error } = await client.from("profiles").select("id, full_name, email, system_role").eq("id", userId).single();
  if (error) throw error;
  return data as AppProfile;
}

export async function loadMembers(programId: string) {
  const client = requireClient();
  const { data, error } = await client.from("program_members").select("*, profile:profiles(id, full_name, email)").eq("program_id", programId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ProgramMember[];
}

export async function loadComments(activityId: string) {
  const client = requireClient();
  const { data, error } = await client.from("activity_comments").select("*, author:profiles(id, full_name, email)").eq("activity_id", activityId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ActivityComment[];
}

export async function createComment(values: Pick<ActivityComment, "activity_id" | "step_id" | "parent_id" | "author_id" | "body">) {
  const client = requireClient();
  const { data, error } = await client.from("activity_comments").insert(values).select("*, author:profiles(id, full_name, email)").single();
  if (error) throw error;
  return data as ActivityComment;
}

export async function loadAuditLogs(programId: string) {
  const client = requireClient();
  const { data, error } = await client.from("audit_logs").select("*, actor:profiles(id, full_name, email)").eq("program_id", programId).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as AuditLog[];
}

export async function createManagedUser(programId: string, email: string, fullName: string, password: string, role: "program_admin" | "viewer") {
  const client = requireClient();
  const normalizedEmail = email.trim().toLowerCase();
  const accountClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await accountClient.auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) throw error;
  if (!data.user) throw new Error("Supabase Auth did not return the newly created user");
  if (data.user.identities?.length === 0) {
    throw new Error("An account with this email already exists. Ask a Superadmin to assign it to this program.");
  }

  const { error: membershipError } = await client.from("program_members").insert({
    program_id: programId,
    user_id: data.user.id,
    role,
  });
  if (membershipError) {
    throw new Error(`The Auth account was created, but program access was not assigned: ${membershipError.message}`);
  }
  return {
    message: `${role} account created for ${normalizedEmail}`,
    requiresEmailConfirmation: !data.session,
  };
}

export async function manageProgramUser(action: "update" | "delete", programId: string, userId: string, values: { fullName?: string; role?: "program_admin" | "viewer" } = {}) {
  const client = requireClient();
  if (action === "delete") {
    const { error } = await client.from("program_members")
      .delete()
      .eq("program_id", programId)
      .eq("user_id", userId)
      .select("id")
      .single();
    if (error) throw error;
    return { message: "Program access revoked; the Supabase Auth account remains active" };
  }

  if (!values.fullName?.trim() || !values.role) {
    throw new Error("A full name and program role are required");
  }
  const { error: profileError } = await client.from("profiles")
    .update({ full_name: values.fullName.trim(), updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id")
    .single();
  if (profileError) throw profileError;

  const { error: membershipError } = await client.from("program_members")
    .update({ role: values.role })
    .eq("program_id", programId)
    .eq("user_id", userId)
    .select("id")
    .single();
  if (membershipError) throw membershipError;
  return { message: "Account updated" };
}
