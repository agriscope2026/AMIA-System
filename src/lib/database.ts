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
  project_title: string;
  implementing_unit: string;
  project_description: string;
  procurement_mode: string;
  early_procurement_activity: boolean;
  bid_evaluation_criteria: string;
  procurement_start: string | null;
  procurement_end: string | null;
  source_of_fund: string;
  estimated_budget: number;
  procurement_strategy: string;
  remarks: string;
  created_at: string;
  updated_at: string;
};

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
  const { data: items, error: itemsError } = await client.from("program_procurement_plan_items")
    .select("*").eq("plan_id", sheet.id).order("created_at");
  if (itemsError) throw itemsError;
  return { sheet: sheet as ProcurementPlanSheet, items: (items ?? []) as ProcurementPlanItem[] };
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

export async function saveProcurementPlanItem(values: Partial<ProcurementPlanItem> & Pick<ProcurementPlanItem, "plan_id" | "project_title" | "implementing_unit" | "project_description" | "procurement_mode" | "early_procurement_activity" | "bid_evaluation_criteria" | "procurement_start" | "procurement_end" | "source_of_fund" | "estimated_budget" | "procurement_strategy" | "remarks">) {
  const { id, ...fields } = values;
  const query = id
    ? requireClient().from("program_procurement_plan_items").update(fields).eq("id", id).select().single()
    : requireClient().from("program_procurement_plan_items").insert(fields).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data as ProcurementPlanItem;
}

export async function deleteProcurementPlanItem(id: string) {
  const { error } = await requireClient().from("program_procurement_plan_items").delete().eq("id", id);
  if (error) throw error;
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
