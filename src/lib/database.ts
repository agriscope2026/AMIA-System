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
  start_date: string;
  target_end_date: string | null;
  approved_budget: number;
  recorded_spending: number;
  status: string;
  current_step_id: string | null;
  current_sub_step: string | null;
  step_remarks: Record<string, string>;
};

export type AppProfile = { id: string; full_name: string; email: string };
export type ProgramMember = { id: string; program_id: string; user_id: string; role: "admin" | "editor" | "viewer"; profile?: AppProfile };
export type ActivityComment = { id: string; activity_id: string; step_id: string | null; parent_id: string | null; author_id: string; body: string; created_at: string; author?: AppProfile };
export type AuditLog = { id: string; program_id: string | null; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string; actor?: AppProfile };

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const databaseConfigured = Boolean(url && anonKey);
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
  const { data, error } = await client.from("workflow_steps").select("*").eq("program_id", programId).eq("is_active", true).order("step_order");
  if (error) throw error;
  return (data ?? []) as DatabaseWorkflowStep[];
}

export async function loadActivities(programId: string) {
  const client = requireClient();
  const { data, error } = await client.from("program_activities").select("*").eq("program_id", programId).order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DatabaseActivity[];
}

export async function updateProgram(programId: string, values: Partial<DatabaseProgram>) {
  const client = requireClient();
  const { error } = await client.from("programs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", programId);
  if (error) throw error;
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

export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function loadProfile(userId: string) {
  const client = requireClient();
  const { data, error } = await client.from("profiles").select("id, full_name, email").eq("id", userId).single();
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

export async function inviteProgramUser(programId: string, email: string, fullName: string, role: "editor" | "viewer") {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("invite-program-user", { body: { programId, email, fullName, role } });
  if (error) throw error;
  return data as { message: string };
}
