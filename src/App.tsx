import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CircleDollarSign,
  Download,
  DollarSign,
  FileText,
  GripVertical,
  ImagePlus,
  LayoutDashboard,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Table2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import "./App.css";
import { createManagedUser, createProgram, createWorkflowStep, databaseConfigured, deleteActivity as deleteDatabaseActivity, deleteAnnualAllocation, deleteBeneficiary, deleteProcurementItem, deleteProcurementPlanItem, getAuthSession, loadActivities, loadAdminDatabaseTables, loadAnnualAllocations, loadAuditLogs, loadBeneficiaries, loadCalendarDayNotes, loadMembers, loadProcurementItems, loadProcurementPlanSheet, loadProcurementPlanYears, loadPrograms, loadProfile, loadWorkflowSteps, manageProgramUser, reorderWorkflowSteps, saveAnnualAllocation, saveBeneficiary, saveCalendarActivitySchedule, saveCalendarDayNote, saveProcurementItem, saveProcurementPlanItem, saveProcurementPlanSheet, signIn, signOut, subscribeToAuth, updateActivity as updateDatabaseActivity, updateProgram as updateDatabaseProgram, updateWorkflowStep } from "./lib/database";
import type { AnnualProgramAllocation, AppProfile, AuditLog, BeneficiaryRecord, CalendarDayNote, ProcurementItem, ProcurementPlanItem, ProcurementPlanSheet, ProcurementPlanType, ProgramMember } from "./lib/database";

type WorkflowStep = {
  id: string;
  title: string;
  description: string;
  assignedRole: string;
  requiredDocuments: string;
  slaDays: number;
  status: "Pending" | "In Progress" | "Completed" | "For Revision";
  isOptional: boolean;
  active: boolean;
  subSteps?: string[];
};
type ProgramConfig = {
  id: string;
  title: string;
  acronym: string;
  agency: string;
  office: string;
  description: string;
  beneficiaries: string;
  units: string;
  primary: string;
  accent: string;
  logo: string;
  steps: WorkflowStep[];
};
type Activity = {
  id: string;
  activityCode: string;
  programId?: string;
  fiscalYear?: number | null;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  unitemizedObligations: number;
  activityDesign?: string;
  status: string;
  currentStep: string;
  currentSubStep?: string;
  stepRemarks?: Record<string, string>;
  completedSubSteps?: Record<string, string[]>;
};

function getActivityYear(activity: Pick<Activity, "startDate" | "fiscalYear">) {
  if (activity.fiscalYear) return activity.fiscalYear;
  if (!activity.startDate) return null;
  const year = Number(activity.startDate.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatScheduleDate(value: string) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString() : "Not scheduled";
}

function formatActivitySchedule(activity: Pick<Activity, "activityCode" | "startDate" | "endDate">) {
  if (!activity.startDate) return "Not scheduled";
  const isAppSchedule = activity.activityCode.startsWith("APP-");
  const formatDate = (value: string) => isAppSchedule
    ? new Date(`${value.slice(0, 7)}-01T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : formatScheduleDate(value);
  return `${formatDate(activity.startDate)}${activity.endDate ? ` to ${formatDate(activity.endDate)}` : ""}`;
}

function getActivityCalendarEndDate(activity: Pick<Activity, "activityCode" | "startDate" | "endDate">) {
  const isAppSchedule = activity.activityCode.startsWith("APP-");
  if (!activity.endDate && !isAppSchedule) return activity.startDate;
  const calendarEnd = activity.endDate || activity.startDate;
  if (!calendarEnd || !isAppSchedule) return calendarEnd;
  const [year, month] = calendarEnd.split("-").map(Number);
  return toLocalDateKey(new Date(year, month, 0));
}

function calendarActivityColorClass(status: string) {
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus.includes("completed")) return "calendar-status-completed";
  if (normalizedStatus.includes("revision")) return "calendar-status-revision";
  if (normalizedStatus.includes("progress")) return "calendar-status-progress";
  if (normalizedStatus.includes("planning") || normalizedStatus.includes("pending")) return "calendar-status-planning";
  return "calendar-status-other";
}

type ProcurementDraft = Omit<ProcurementItem, "id" | "program_id" | "activity_id">;
type ProcurementDraftEntry = ProcurementDraft & { draftKey: string; id?: string };
const createProcurementDraft = (): ProcurementDraftEntry => ({
  draftKey: crypto.randomUUID(),
  category: "Other goods or services",
  item_description: "",
  supplier_name: "",
  procurement_method: "Small Value Procurement",
  purchase_order_number: "",
  quantity: 1,
  unit: "lot",
  unit_cost: 0,
  workflow_step_id: null,
  obligated_amount: 0,
  obligation_status: "Not obligated",
  delivery_status: "For procurement",
  delivery_date: null,
});
type AppPlanRowDraft = {
  project_title: string;
  implementing_unit: string;
  project_description: string;
  procurement_mode: string;
  early_procurement_activity: boolean;
  bid_evaluation_criteria: string;
  procurement_start: string;
  procurement_end: string;
  source_of_fund: string;
  estimated_budget: string;
  procurement_strategy: string;
  remarks: string;
};
const appPlanCsvColumns = [
  ["project_title", "Project title"],
  ["implementing_unit", "End-user / implementing unit"],
  ["project_description", "Project description"],
  ["procurement_mode", "Procurement mode"],
  ["early_procurement_activity", "Early procurement activity"],
  ["bid_evaluation_criteria", "Bid evaluation criteria"],
  ["procurement_start", "Procurement start (YYYY-MM)"],
  ["procurement_end", "Procurement end (YYYY-MM)"],
  ["source_of_fund", "Source of fund"],
  ["estimated_budget", "Estimated budget (PHP)"],
  ["procurement_strategy", "Procurement strategy / tools"],
  ["remarks", "Remarks"],
] as const;
type DashboardChartMetric = "appropriation" | "allotment" | "obligations" | "disbursements" | "accountsPayable" | "cashAdvances" | "liquidation" | "savings" | "activityBudget" | "appBudget" | "totalActivities" | "completedActivities" | "notCompletedActivities" | "overdueActivities";
type DashboardChartDatum = { label: string; value: number };
type AllocationDraft = {
  fund_source: string;
  allotment_reference: string;
  disbursement_reference: string;
  appropriation: string;
  allotment_received: string;
  disbursements: string;
  accounts_payable: string;
  cash_advances: string;
  liquidation: string;
  savings: string;
  remarks: string;
};
type DashboardFinancialColumn = "appropriation" | "allotment" | "obligations" | "disbursements" | "accountsPayable" | "cashAdvances" | "liquidation" | "savings" | "activityBudget" | "appBudget";

const createEmptyAllocationDraft = () => ({
  fund_source: "General Appropriations Act (GAA)",
  allotment_reference: "",
  disbursement_reference: "",
  appropriation: "",
  allotment_received: "",
  disbursements: "",
  accounts_payable: "",
  cash_advances: "",
  liquidation: "",
  savings: "",
  remarks: "",
});

const parseCsv = (contents: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = contents.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const allocationToDraft = (row: AnnualProgramAllocation): AllocationDraft => ({
  fund_source: row.fund_source,
  allotment_reference: row.allotment_reference ?? "",
  disbursement_reference: row.disbursement_reference ?? "",
  appropriation: String(row.appropriation),
  allotment_received: String(row.allotment_received),
  disbursements: String(row.disbursements),
  accounts_payable: String(row.accounts_payable),
  cash_advances: String(row.cash_advances),
  liquidation: String(row.liquidation),
  savings: String(row.savings),
  remarks: row.remarks ?? "",
});
const createEmptyAppPlanRowDraft = (): AppPlanRowDraft => ({
  project_title: "",
  implementing_unit: "",
  project_description: "",
  procurement_mode: "",
  early_procurement_activity: false,
  bid_evaluation_criteria: "",
  procurement_start: "",
  procurement_end: "",
  source_of_fund: "",
  estimated_budget: "",
  procurement_strategy: "",
  remarks: "",
});
const appPlanItemToDraft = (row: ProcurementPlanItem): AppPlanRowDraft => ({
  project_title: row.project_title,
  implementing_unit: row.implementing_unit,
  project_description: row.project_description,
  procurement_mode: row.procurement_mode,
  early_procurement_activity: row.early_procurement_activity,
  bid_evaluation_criteria: row.bid_evaluation_criteria,
  procurement_start: row.procurement_start?.slice(0, 7) ?? "",
  procurement_end: row.procurement_end?.slice(0, 7) ?? "",
  source_of_fund: row.source_of_fund,
  estimated_budget: String(row.estimated_budget),
  procurement_strategy: row.procurement_strategy,
  remarks: row.remarks,
});

const mapDatabaseStep = (step: import("./lib/database").DatabaseWorkflowStep): WorkflowStep => ({
  id: step.id,
  title: step.title,
  description: step.description ?? "",
  assignedRole: step.assigned_role,
  requiredDocuments: step.required_documents.join(", "),
  slaDays: step.sla_days,
  status: step.status_tag,
  isOptional: step.is_optional,
  active: step.is_active,
  subSteps: step.sub_steps ?? [],
});

const mapDatabaseActivity = (activity: import("./lib/database").DatabaseActivity, steps: WorkflowStep[], programId?: string): Activity => ({
  id: activity.id,
  activityCode: activity.activity_code,
  programId,
  fiscalYear: activity.fiscal_year,
  name: activity.title,
  location: activity.location ?? "",
  startDate: activity.start_date ?? "",
  endDate: activity.target_end_date ?? "",
  budget: Number(activity.approved_budget),
  spent: Number(activity.recorded_spending),
  unitemizedObligations: Number(activity.unitemized_obligations ?? activity.recorded_spending),
  activityDesign: activity.activity_design ?? "",
  status: getActivityStatus(steps, steps.find((step) => step.id === activity.current_step_id)?.title ?? steps[0]?.title ?? "", activity.current_sub_step ?? ""),
  currentStep: steps.find((step) => step.id === activity.current_step_id)?.title ?? steps[0]?.title ?? "",
  currentSubStep: activity.current_sub_step ?? "",
  stepRemarks: activity.step_remarks ?? {},
  completedSubSteps: activity.completed_sub_steps ?? {},
});

function getActivityStatus(workflow: WorkflowStep[], currentStep: string, currentSubStep: string) {
  const activeSteps = workflow.filter((step) => step.active);
  const finalStep = activeSteps[activeSteps.length - 1];
  const finalSubSteps = finalStep?.subSteps ?? [];
  const isComplete = finalStep?.title === currentStep && (!finalSubSteps.length || finalSubSteps.at(-1) === currentSubStep);
  return isComplete ? "Completed" : currentStep;
}

function getNumberedStep(workflow: WorkflowStep[], title: string) {
  const stepNumber = workflow.filter((step) => step.active).findIndex((step) => step.title === title) + 1;
  return stepNumber > 0 ? `${stepNumber}. ${title}` : title;
}

const mapDatabaseProgram = (program: import("./lib/database").DatabaseProgram, steps: WorkflowStep[]): ProgramConfig => ({
  id: program.id,
  title: program.title,
  acronym: program.acronym,
  agency: program.agency_title,
  office: program.office_subtitle ?? "",
  description: program.description ?? "",
  beneficiaries: program.target_beneficiaries ?? "",
  units: program.operating_units.join(", "),
  primary: program.theme_color,
  accent: program.accent_color,
  logo: program.logo_url ?? "",
  steps,
});

function getDatabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return typeof error === "string" ? error : "Unknown database error";
  }
  const details = error as Record<string, unknown>;
  const fields = [
    typeof details.message === "string" ? details.message : null,
    typeof details.code === "string" ? `Code: ${details.code}` : null,
    typeof details.details === "string" ? `Details: ${details.details}` : null,
    typeof details.hint === "string" ? `Hint: ${details.hint}` : null,
  ].filter((field): field is string => Boolean(field));
  return fields.length ? fields.join(" — ") : "Unknown database error";
}

const emptyProgramConfig: ProgramConfig = {
  id: "",
  title: "",
  acronym: "",
  agency: "",
  office: "",
  description: "",
  beneficiaries: "",
  units: "",
  primary: "#1c6653",
  accent: "#d8a642",
  logo: "",
  steps: [],
};

function App() {
  const [programOptions, setProgramOptions] = useState<ProgramConfig[]>([]);
  const [program, setProgram] = useState<ProgramConfig>(emptyProgramConfig);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesByProgram, setActivitiesByProgram] = useState<Record<string, Activity[]>>({});
  const [selectedId, setSelectedId] = useState("");
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [stepDialogEditing, setStepDialogEditing] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [dashboardActivityDialogTarget, setDashboardActivityDialogTarget] = useState<Activity | null>(null);
  const [expandedTimelineSteps, setExpandedTimelineSteps] = useState<Record<string, boolean>>({});
  const [workflowStepSelections, setWorkflowStepSelections] = useState<Record<string, string>>({});
  const [pendingTimelineStep, setPendingTimelineStep] = useState<{ stepTitle: string; subStep: string; shouldComplete: boolean } | null>(null);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [session, setSession] = useState<Awaited<ReturnType<typeof getAuthSession>>>(null);
  const [authReady, setAuthReady] = useState(!databaseConfigured);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [programRole, setProgramRole] = useState<ProgramMember["role"]>("viewer");
  const [systemRole, setSystemRole] = useState<"superadmin" | "user">("user");
  const [members, setMembers] = useState<ProgramMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [accountForm, setAccountForm] = useState({ email: "", fullName: "", password: "", role: "viewer" as "superadmin" | "program_admin" | "viewer" });
  const [programForm, setProgramForm] = useState({ title: "", acronym: "", agency: "Department of Agriculture", office: "", description: "", beneficiaries: "", units: "", adminFullName: "", adminEmail: "", adminPassword: "" });
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [activityDialogTab, setActivityDialogTab] = useState<"timeline" | "design" | "workflow" | "procurement">("workflow");
  const [showProgramDetailDialog, setShowProgramDetailDialog] = useState(false);
  const [showProgramCreateDialog, setShowProgramCreateDialog] = useState(false);
  const [programCreateError, setProgramCreateError] = useState("");
  const [programDialogEditing, setProgramDialogEditing] = useState(false);
  const [programDialogTab, setProgramDialogTab] = useState<"details" | "admins">("details");
  const [memberDialog, setMemberDialog] = useState<ProgramMember | null>(null);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "details" | "workflow" | "activities" | "calendar" | "beneficiaries" | "settings" | "finance"
  >("dashboard");
  const [settingsSection, setSettingsSection] = useState<"fund-workflow" | "audit" | "database" | "programs">("fund-workflow");
  const [activityView] = useState<"timeline" | "table">("table");
  const [activitySearch, setActivitySearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(() => toLocalDateKey(new Date()));
  const [calendarDialogDay, setCalendarDialogDay] = useState<string | null>(null);
  const [calendarDayNotes, setCalendarDayNotes] = useState<Record<string, CalendarDayNote>>({});
  const [calendarNoteDrafts, setCalendarNoteDrafts] = useState<Record<string, string>>({});
  const [calendarNotesLoadedScope, setCalendarNotesLoadedScope] = useState<string | null>(null);
  const [calendarNotesLoadErrorScope, setCalendarNotesLoadErrorScope] = useState<string | null>(null);
  const [calendarNotesReloadToken, setCalendarNotesReloadToken] = useState(0);
  const [calendarNoteSaving, setCalendarNoteSaving] = useState(false);
  const [calendarScheduleEditingId, setCalendarScheduleEditingId] = useState<string | null>(null);
  const [calendarScheduleDraft, setCalendarScheduleDraft] = useState<{ startDate: string; endDate: string; isAppSchedule: boolean } | null>(null);
  const [calendarScheduleSaving, setCalendarScheduleSaving] = useState(false);
  const [beneficiaryRecords, setBeneficiaryRecords] = useState<BeneficiaryRecord[]>([]);
  const [beneficiaryLoadedScope, setBeneficiaryLoadedScope] = useState<string | null>(null);
  const [beneficiarySearch, setBeneficiarySearch] = useState("");
  const [beneficiaryProgramFilter, setBeneficiaryProgramFilter] = useState("all");
  const [beneficiaryDialogOpen, setBeneficiaryDialogOpen] = useState(false);
  const [beneficiaryEditingId, setBeneficiaryEditingId] = useState<string | null>(null);
  const [beneficiarySaving, setBeneficiarySaving] = useState(false);
  const [beneficiaryToDelete, setBeneficiaryToDelete] = useState<BeneficiaryRecord | null>(null);
  const [beneficiaryDeleting, setBeneficiaryDeleting] = useState(false);
  const [beneficiaryForm, setBeneficiaryForm] = useState({
    program_id: "",
    activity_ids: [] as string[],
    beneficiary_name: "",
    beneficiary_acronym: "",
    fca_category: "",
    membership_count: "",
    contact_person: "",
    contact_number: "",
    additional_details: "",
    province: "",
    municipality: "",
    barangay: "",
    other_assistance_interventions: "",
  });
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [newActivity, setNewActivity] = useState({
    name: "",
    location: "",
    startDate: "",
    endDate: "",
    budget: "",
    spent: "0",
    activityDesign: "",
    status: "Planning" as Activity["status"],
    currentStep: "",
    currentSubStep: "",
  });
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [databaseTables, setDatabaseTables] = useState<Record<string, Record<string, unknown>[]>>({});
  const [selectedDatabaseTable, setSelectedDatabaseTable] = useState("programs");
  const [databaseLoading, setDatabaseLoading] = useState(false);
  const [annualAllocations, setAnnualAllocations] = useState<AnnualProgramAllocation[]>([]);
  const [allocationsByProgram, setAllocationsByProgram] = useState<Record<string, AnnualProgramAllocation[]>>({});
  const [allocationRowDrafts, setAllocationRowDrafts] = useState<Record<string, AllocationDraft>>({});
  const [allocationRowSavingId, setAllocationRowSavingId] = useState<string | null>(null);
  const [showAllocationEditor, setShowAllocationEditor] = useState(false);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(new Date().getFullYear());
  const [procurementPlanYears, setProcurementPlanYears] = useState<number[]>([]);
  const [financeSheet, setFinanceSheet] = useState<ProcurementPlanType>("APP");
  const [procurementPlanSheet, setProcurementPlanSheet] = useState<ProcurementPlanSheet | null>(null);
  const [procurementPlanItems, setProcurementPlanItems] = useState<ProcurementPlanItem[]>([]);
  const [procurementPlanDrafts, setProcurementPlanDrafts] = useState<Record<string, AppPlanRowDraft>>({});
  const [financeCellEditor, setFinanceCellEditor] = useState<{ row: ProcurementPlanItem | null; field: keyof AppPlanRowDraft; label: string } | null>(null);
  const [procurementPlanHeader, setProcurementPlanHeader] = useState({ is_continuing: false, plan_status: "Indicative" as "Indicative" | "Final", version_no: "" });
  const [procurementPlanLoading, setProcurementPlanLoading] = useState(false);
  const [procurementPlanSavingId, setProcurementPlanSavingId] = useState<string | null>(null);
  const [procurementPlanImporting, setProcurementPlanImporting] = useState(false);
  const appPlanImportInputRef = useRef<HTMLInputElement>(null);
  const [appPlanColumnWidths, setAppPlanColumnWidths] = useState([180, 130, 180, 130, 125, 190, 115, 115, 120, 160, 160, 170, 115]);
  const [appColumnResize, setAppColumnResize] = useState<{ index: number; startX: number; startWidth: number } | null>(null);
  const [dashboardProgressView, setDashboardProgressView] = useState<"graph" | "list">("graph");
  const [showDashboardProgressSettings, setShowDashboardProgressSettings] = useState(false);
  const [dashboardFiscalYear, setDashboardFiscalYear] = useState(new Date().getFullYear());
  const [dashboardProgramFilter, setDashboardProgramFilter] = useState("all");
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState("all");
  const [dashboardChartMetric, setDashboardChartMetric] = useState<DashboardChartMetric | null>(null);
  const [dashboardStatusDialog, setDashboardStatusDialog] = useState<string | null>(null);
  const [dashboardFinancialColumns, setDashboardFinancialColumns] = useState<DashboardFinancialColumn[]>(["appropriation", "allotment", "obligations", "disbursements", "activityBudget", "appBudget"]);
  const [dashboardAppBudgetsByProgram, setDashboardAppBudgetsByProgram] = useState<Record<string, number>>({});
  const [showDashboardCardSettings, setShowDashboardCardSettings] = useState(false);
  const [procurementItems, setProcurementItems] = useState<ProcurementItem[]>([]);
  const [procurementDrafts, setProcurementDrafts] = useState<ProcurementDraftEntry[]>([]);
  const [procurementLoadedActivityId, setProcurementLoadedActivityId] = useState<string | null>(null);
  const activeSteps = useMemo(
    () => steps.filter((step) => step.active),
    [steps],
  );
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const firstVisibleDay = new Date(firstOfMonth);
    firstVisibleDay.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstVisibleDay);
      date.setDate(firstVisibleDay.getDate() + index);
      return { date, key: toLocalDateKey(date), inMonth: date.getMonth() === calendarMonth.getMonth() };
    });
  }, [calendarMonth]);
  const calendarMonthTitle = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const calendarNotesScope = `${program.id}:${calendarDays[0].key}:${calendarDays[calendarDays.length - 1].key}`;
  const calendarNotesLoading = activeTab === "calendar" && databaseConfigured && Boolean(session?.user.id && program.id)
    && calendarNotesLoadedScope !== calendarNotesScope && calendarNotesLoadErrorScope !== calendarNotesScope;
  const calendarNotesUnavailable = calendarNotesLoadErrorScope === calendarNotesScope;
  const scheduledCalendarActivities = activities.filter((activity) => Boolean(activity.startDate));
  const unscheduledCalendarActivities = activities.filter((activity) => !activity.startDate);
  const selectedStep = steps.find((step) => step.id === selectedId) ?? steps[0];
  const today = new Date().toISOString().slice(0, 10);
  const currentFiscalYear = new Date().getFullYear();
  const dashboardActivityMap = useMemo(() => ({ ...activitiesByProgram, [program.id]: activities }), [activities, activitiesByProgram, program.id]);
  const allDashboardActivities = systemRole === "superadmin" ? Object.values(dashboardActivityMap).flat() : activities;
  const dashboardYearOptions = Array.from(new Set([
    currentFiscalYear - 1,
    currentFiscalYear,
    currentFiscalYear + 1,
    ...Object.values(allocationsByProgram).flat().map((allocation) => allocation.fiscal_year),
    ...allDashboardActivities.map(getActivityYear).filter((year): year is number => year !== null),
  ])).sort((a, b) => b - a);
  const dashboardYear = dashboardFiscalYear;
  const dashboardActivities = allDashboardActivities.filter((activity) =>
    (dashboardProgramFilter === "all" || activity.programId === dashboardProgramFilter)
    && getActivityYear(activity) === dashboardYear
    && (dashboardStatusFilter === "all" || activity.status === dashboardStatusFilter),
  );
  const dashboardTotals = useMemo(() => ({
    activities: dashboardActivities.length,
    budget: dashboardActivities.reduce((total, activity) => total + activity.budget, 0),
    spent: dashboardActivities.reduce((total, activity) => total + activity.spent, 0),
    overdue: dashboardActivities.filter((activity) => Boolean(activity.endDate) && activity.endDate < today && activity.status !== "Completed").length,
    completed: dashboardActivities.filter((activity) => activity.status === "Completed").length,
  }), [dashboardActivities, today]);
  const dashboardYearActivities = allDashboardActivities.filter((activity) =>
    (dashboardProgramFilter === "all" || activity.programId === dashboardProgramFilter)
    && getActivityYear(activity) === dashboardYear,
  );
  const dashboardObligations = dashboardYearActivities.reduce((total, activity) => total + activity.spent, 0);
  const dashboardYearActivityBudget = dashboardYearActivities.reduce((total, activity) => total + activity.budget, 0);
  const formatDashboardCurrency = (amount: number) => `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dashboardAllocations = useMemo(() => (systemRole === "superadmin"
    ? dashboardProgramFilter === "all"
      ? Object.values(allocationsByProgram).flat()
      : allocationsByProgram[dashboardProgramFilter] ?? []
    : allocationsByProgram[program.id] ?? annualAllocations), [allocationsByProgram, annualAllocations, dashboardProgramFilter, program.id, systemRole]);
  const dashboardYearAllocations = useMemo(
    () => dashboardAllocations.filter((row) => row.fiscal_year === dashboardYear),
    [dashboardAllocations, dashboardYear],
  );
  const dashboardFinancialTotals = useMemo(() => dashboardYearAllocations
    .reduce((total, row) => ({
      appropriation: total.appropriation + Number(row.appropriation),
      allotment: total.allotment + Number(row.allotment_received),
      disbursements: total.disbursements + Number(row.disbursements),
      accountsPayable: total.accountsPayable + Number(row.accounts_payable),
      cashAdvances: total.cashAdvances + Number(row.cash_advances),
      liquidation: total.liquidation + Number(row.liquidation),
      savings: total.savings + Number(row.savings),
    }), { appropriation: 0, allotment: 0, disbursements: 0, accountsPayable: 0, cashAdvances: 0, liquidation: 0, savings: 0 }), [dashboardYearAllocations]);
  const dashboardAppBudget = (systemRole === "superadmin" && dashboardProgramFilter === "all"
    ? Object.values(dashboardAppBudgetsByProgram)
    : [dashboardAppBudgetsByProgram[systemRole === "superadmin" ? dashboardProgramFilter : program.id] ?? 0])
    .reduce((sum, amount) => sum + amount, 0);
  const dashboardFinancialCardOptions: Array<{ id: DashboardFinancialColumn; label: string; value: number; detail: string; metric: DashboardChartMetric }> = [
    { id: "appropriation", label: "Allocated budget / appropriation", value: dashboardFinancialTotals.appropriation, detail: "Annual budget authority", metric: "appropriation" },
    { id: "allotment", label: "Allotment received", value: dashboardFinancialTotals.allotment, detail: "Available allotment", metric: "allotment" },
    { id: "obligations", label: "Obligations", value: dashboardObligations, detail: "Computed from activity obligations", metric: "obligations" },
    { id: "disbursements", label: "Disbursements", value: dashboardFinancialTotals.disbursements, detail: "Paid against recorded obligations", metric: "disbursements" },
    { id: "accountsPayable", label: "Accounts payable", value: dashboardFinancialTotals.accountsPayable, detail: `FY ${dashboardYear}`, metric: "accountsPayable" },
    { id: "cashAdvances", label: "Cash advances", value: dashboardFinancialTotals.cashAdvances, detail: `FY ${dashboardYear}`, metric: "cashAdvances" },
    { id: "liquidation", label: "Liquidation", value: dashboardFinancialTotals.liquidation, detail: `FY ${dashboardYear}`, metric: "liquidation" },
    { id: "savings", label: "Savings", value: dashboardFinancialTotals.savings, detail: `FY ${dashboardYear}`, metric: "savings" },
    { id: "activityBudget", label: "Approved activity budget", value: dashboardYearActivityBudget, detail: "Across matching activities", metric: "activityBudget" },
    { id: "appBudget", label: "APP planned procurement", value: dashboardAppBudget, detail: `FY ${dashboardYear} estimated contract amounts`, metric: "appBudget" },
  ];
  const dashboardProgramCount = systemRole === "superadmin" && dashboardProgramFilter === "all" ? programOptions.length : 1;
  const dashboardScopeLabel = systemRole === "superadmin"
    ? dashboardProgramFilter === "all" ? "All programs" : programOptions.find((item) => item.id === dashboardProgramFilter)?.acronym ?? "Selected program"
    : program.acronym;
  const dashboardStatusSummary = useMemo(() => {
    const statuses = Array.from(new Set(allDashboardActivities.map((activity) => activity.status))).sort();
    const counts = new Map<string, number>(statuses.map((status) => [status, 0]));
    dashboardActivities.forEach((activity) => counts.set(activity.status, (counts.get(activity.status) ?? 0) + 1));
    return Array.from(counts, ([label, count]) => ({
      label,
      count,
      className: `dashboard-status-color-${statuses.indexOf(label) % 5}`,
    }));
  }, [allDashboardActivities, dashboardActivities]);
  const dashboardChartTitles: Record<DashboardChartMetric, { title: string; unit: "currency" | "count" }> = {
    appropriation: { title: "Allocated budget by program", unit: "currency" },
    allotment: { title: "Allotment received by program", unit: "currency" },
    obligations: { title: "Obligations by program", unit: "currency" },
    disbursements: { title: "Disbursements by program", unit: "currency" },
    accountsPayable: { title: "Accounts payable by program", unit: "currency" },
    cashAdvances: { title: "Cash advances by program", unit: "currency" },
    liquidation: { title: "Liquidation by program", unit: "currency" },
    savings: { title: "Savings by program", unit: "currency" },
    activityBudget: { title: "Approved activity budget by program", unit: "currency" },
    appBudget: { title: "APP planned procurement by program", unit: "currency" },
    totalActivities: { title: "Activities by program", unit: "count" },
    completedActivities: { title: "Completed activities by program", unit: "count" },
    notCompletedActivities: { title: "Activities not completed by program", unit: "count" },
    overdueActivities: { title: "Overdue activities by program", unit: "count" },
  };
  const dashboardChartData = useMemo<DashboardChartDatum[]>(() => {
    const selectedPrograms = systemRole === "superadmin"
      ? dashboardProgramFilter === "all" ? programOptions : programOptions.filter((item) => item.id === dashboardProgramFilter)
      : programOptions.filter((item) => item.id === program.id);
    const financialFields: Partial<Record<DashboardChartMetric, keyof AnnualProgramAllocation>> = {
      appropriation: "appropriation",
      allotment: "allotment_received",
      disbursements: "disbursements",
      accountsPayable: "accounts_payable",
      cashAdvances: "cash_advances",
      liquidation: "liquidation",
      savings: "savings",
    };
    return selectedPrograms.map((item) => {
      const programActivities = dashboardActivities.filter((activity) => activity.programId === item.id);
      const allocations = (allocationsByProgram[item.id] ?? []).filter((row) => row.fiscal_year === dashboardYear);
      const financialField = dashboardChartMetric ? financialFields[dashboardChartMetric] : undefined;
      let value = 0;
      if (financialField) {
        value = allocations.reduce((sum, row) => sum + Number(row[financialField] ?? 0), 0);
      } else if (dashboardChartMetric === "obligations") {
        value = allDashboardActivities
          .filter((activity) => activity.programId === item.id && getActivityYear(activity) === dashboardYear)
          .reduce((sum, activity) => sum + activity.spent, 0);
      } else if (dashboardChartMetric === "activityBudget") {
        value = allDashboardActivities
          .filter((activity) => activity.programId === item.id && getActivityYear(activity) === dashboardYear)
          .reduce((sum, activity) => sum + activity.budget, 0);
      } else if (dashboardChartMetric === "appBudget") {
        value = dashboardAppBudgetsByProgram[item.id] ?? 0;
      } else if (dashboardChartMetric === "totalActivities") {
        value = programActivities.length;
      } else if (dashboardChartMetric === "completedActivities") {
        value = programActivities.filter((activity) => activity.status === "Completed").length;
      } else if (dashboardChartMetric === "notCompletedActivities") {
        value = programActivities.filter((activity) => activity.status !== "Completed").length;
      } else if (dashboardChartMetric === "overdueActivities") {
        value = programActivities.filter((activity) => Boolean(activity.endDate) && activity.endDate < today && activity.status !== "Completed").length;
      }
      return { label: item.acronym, value };
    });
  }, [allDashboardActivities, allocationsByProgram, dashboardActivities, dashboardAppBudgetsByProgram, dashboardChartMetric, dashboardProgramFilter, dashboardYear, program.id, programOptions, systemRole, today]);
  const dashboardChartActivities = (() => {
    if (!dashboardChartMetric) return [];
    const source = dashboardChartMetric === "activityBudget" || dashboardChartMetric === "obligations"
      ? dashboardYearActivities
      : dashboardActivities;
    const matchingActivities = dashboardChartMetric === "completedActivities"
      ? source.filter((activity) => activity.status === "Completed")
      : dashboardChartMetric === "notCompletedActivities"
        ? source.filter((activity) => activity.status !== "Completed")
        : dashboardChartMetric === "overdueActivities"
          ? source.filter((activity) => Boolean(activity.endDate) && activity.endDate < today && activity.status !== "Completed")
          : source;
    return [...matchingActivities].sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name));
  })();
  const dashboardStatusDialogActivities = dashboardStatusDialog
    ? allDashboardActivities.filter((activity) =>
      (dashboardProgramFilter === "all" || activity.programId === dashboardProgramFilter)
      && getActivityYear(activity) === dashboardYear
      && activity.status === dashboardStatusDialog,
    ).sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name))
    : [];
  const dashboardActivityDialogSteps = programOptions.find((item) => item.id === dashboardActivityDialogTarget?.programId)?.steps ?? steps;
  const dashboardActivityDialogActiveSteps = dashboardActivityDialogSteps.filter((step) => step.active);
  const dashboardActivityDialogCurrentStep = dashboardActivityDialogSteps.find((step) => step.title === dashboardActivityDialogTarget?.currentStep);
  const openDashboardActivity = (activity: Activity) => {
    setDashboardActivityDialogTarget(activity);
    setSelectedActivityId(activity.id);
    setShowActivityDialog(true);
    setDashboardChartMetric(null);
    setDashboardStatusDialog(null);
  };
  const downloadDashboardChart = (format: "csv" | "svg") => {
    if (!dashboardChartMetric) return;
    const chart = dashboardChartTitles[dashboardChartMetric];
    const safeLabel = (value: string) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
    let contents: string;
    let mimeType: string;
    let extension: string;
    if (format === "csv") {
      const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
      contents = `\uFEFF${escapeCsv(chart.title)},${escapeCsv(chart.unit === "currency" ? "Amount (PHP)" : "Activities")}\r\n${dashboardChartData.map((row) => `${escapeCsv(row.label)},${row.value}`).join("\r\n")}`;
      mimeType = "text/csv;charset=utf-8";
      extension = "csv";
    } else {
      const width = 960;
      const left = 190;
      const barWidth = 570;
      const rowHeight = 52;
      const top = 86;
      const height = Math.max(170, top + dashboardChartData.length * rowHeight + 24);
      const max = Math.max(1, ...dashboardChartData.map((row) => row.value));
      const bars = dashboardChartData.map((row, index) => {
        const y = top + index * rowHeight;
        const value = chart.unit === "currency" ? formatDashboardCurrency(row.value) : row.value.toLocaleString();
        return `<text x="18" y="${y + 20}" font-size="15" fill="#405b4e">${safeLabel(row.label)}</text><rect x="${left}" y="${y}" width="${barWidth}" height="26" rx="6" fill="#edf2ee"/><rect x="${left}" y="${y}" width="${Math.max(0, row.value / max * barWidth)}" height="26" rx="6" fill="#43835b"/><text x="${left + barWidth + 14}" y="${y + 19}" font-size="14" fill="#29483d">${safeLabel(value)}</text>`;
      }).join("");
      contents = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><text x="18" y="34" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="#29483d">${safeLabel(chart.title)}</text><text x="18" y="58" font-family="Arial,sans-serif" font-size="13" fill="#819188">${safeLabel(`${dashboardScopeLabel} · FY ${dashboardYear}`)}</text><g font-family="Arial,sans-serif">${bars}</g></svg>`;
      mimeType = "image/svg+xml;charset=utf-8";
      extension = "svg";
    }
    const blobUrl = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${dashboardChartMetric}-fy${dashboardYear}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };
  const loadDatabaseBrowser = async () => {
    if (systemRole !== "superadmin") return;
    setDatabaseLoading(true);
    try {
      if (databaseConfigured) {
        setDatabaseTables(await loadAdminDatabaseTables());
      } else {
        throw new Error("Configure Supabase before opening the database browser");
      }
      setNotice("Database browser refreshed");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load database contents");
    } finally {
      setDatabaseLoading(false);
    }
  };

  useEffect(() => {
    if (!databaseConfigured) return;
    let mounted = true;
    void getAuthSession().then((currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      setAuthReady(true);
    }).catch(() => setAuthReady(true));
    const subscription = subscribeToAuth((currentSession) => {
      setSession(currentSession);
      setAuthReady(true);
    });
    return () => { mounted = false; subscription.data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!databaseConfigured || !session?.user) return;
    let currentRequest = true;
    void loadProfile(session.user.id).then((loadedProfile) => {
      if (!currentRequest) return;
      setProfile(loadedProfile);
      setSystemRole(loadedProfile.system_role ?? "user");
    }).catch((error: unknown) => {
      if (!currentRequest) return;
      setProfile({ id: session.user.id, full_name: session.user.email ?? "User", email: session.user.email ?? "" });
      setSystemRole("user");
      setNotice(`Your account profile could not be loaded: ${getDatabaseErrorMessage(error)}`);
      console.error(error);
    });
    return () => { currentRequest = false; };
  }, [session]);

  useEffect(() => {
    if (!databaseConfigured || !session?.user || !program.id) return;
    let currentRequest = true;
    void loadMembers(program.id).then((loadedMembers) => {
      if (!currentRequest) return;
      setMembers(loadedMembers);
      setProgramRole(loadedMembers.find((member) => member.user_id === session.user.id)?.role ?? "viewer");
    }).catch((error: unknown) => {
      if (!currentRequest) return;
      setMembers([]);
      setProgramRole("viewer");
      setNotice(error instanceof Error
        ? `Could not load program permissions: ${error.message}`
        : "Could not load program permissions");
    });
    void loadAuditLogs(program.id).then((logs) => {
      if (currentRequest) setAuditLogs(logs);
    }).catch(() => { if (currentRequest) setAuditLogs([]); });
    return () => { currentRequest = false; };
  }, [program.id, session]);

  useEffect(() => {
    if (!databaseConfigured || !program.id || activeTab !== "finance") return;
    void loadAnnualAllocations(program.id).then((rows) => {
      setAnnualAllocations(rows);
      setAllocationsByProgram((current) => ({ ...current, [program.id]: rows }));
    }).catch((error: unknown) => {
      setNotice(error instanceof Error ? `Could not load annual allocations: ${error.message}` : "Could not load annual allocations");
    });
  }, [activeTab, program.id]);

  useEffect(() => {
    if (!databaseConfigured || !program.id || activeTab !== "finance") return;
    if (financeSheet !== "APP") return;
    let currentRequest = true;
    const loadPlan = async () => {
      await Promise.resolve();
      if (!currentRequest) return;
      setProcurementPlanSheet(null);
      setProcurementPlanItems([]);
      setProcurementPlanLoading(true);
      try {
        const [{ sheet, items }, years] = await Promise.all([
          loadProcurementPlanSheet(program.id, selectedFiscalYear, financeSheet),
          loadProcurementPlanYears(program.id),
        ]);
        if (!currentRequest) return;
        setProcurementPlanSheet(sheet);
        setProcurementPlanItems(items);
        setProcurementPlanYears(years);
        setProcurementPlanHeader({
          is_continuing: sheet?.is_continuing ?? false,
          plan_status: sheet?.plan_status ?? "Indicative",
          version_no: sheet?.version_no ?? "",
        });
        setProcurementPlanDrafts({});
      } catch (error) {
        if (currentRequest) setNotice(error instanceof Error ? `Could not load the FY ${selectedFiscalYear} APP: ${error.message}` : "Could not load the annual procurement plan");
      } finally {
        if (currentRequest) setProcurementPlanLoading(false);
      }
    };
    void loadPlan();
    return () => { currentRequest = false; };
  }, [activeTab, financeSheet, program.id, selectedFiscalYear]);

  useEffect(() => {
    if (!databaseConfigured || !programOptions.length) return;
    let currentRequest = true;
    const selectedPrograms = systemRole === "superadmin"
      ? dashboardProgramFilter === "all" ? programOptions : programOptions.filter((item) => item.id === dashboardProgramFilter)
      : programOptions.filter((item) => item.id === program.id);
    const loadBudgets = async () => {
      await Promise.resolve();
      try {
        const entries = await Promise.all(selectedPrograms.map(async (item) => {
          const { items } = await loadProcurementPlanSheet(item.id, dashboardYear, "APP");
          return [item.id, items.reduce((total, row) => total + Number(row.estimated_budget), 0)] as const;
        }));
        if (!currentRequest) return;
        setDashboardAppBudgetsByProgram((current) => ({
          ...(systemRole === "superadmin" && dashboardProgramFilter === "all" ? current : {}),
          ...Object.fromEntries(entries),
        }));
      } catch (error) {
        if (currentRequest) setNotice(error instanceof Error ? `Could not load APP dashboard totals: ${error.message}` : "Could not load APP dashboard totals");
      }
    };
    void loadBudgets();
    return () => { currentRequest = false; };
  }, [dashboardProgramFilter, dashboardYear, program.id, programOptions, systemRole]);

  useEffect(() => {
    if (!databaseConfigured || !showActivityDialog || !selectedActivityId) return;
    let currentRequest = true;
    void loadProcurementItems(selectedActivityId).then((items) => {
      if (!currentRequest) return;
      setProcurementItems(items);
      setProcurementDrafts([]);
      setProcurementLoadedActivityId(selectedActivityId);
    }).catch((error: unknown) => {
      if (!currentRequest) return;
      setNotice(error instanceof Error ? `Could not load procurement items: ${error.message}` : "Could not load procurement items");
      setProcurementItems([]);
      setProcurementDrafts([]);
      setProcurementLoadedActivityId(selectedActivityId);
    });
    return () => { currentRequest = false; };
  }, [selectedActivityId, showActivityDialog]);

  const canManageFinance = programRole === "program_admin";
  const canEditBeneficiaries = systemRole !== "superadmin" && programRole === "program_admin";
  const canEdit = systemRole === "superadmin" || programRole === "program_admin" || programRole === "editor";
  const isAdmin = systemRole === "superadmin" || programRole === "program_admin";
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");
    try {
      await signIn(loginEmail.trim(), loginPassword);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to sign in");
    }
  };
  const createAccount = async () => {
    const role = systemRole === "superadmin" && accountForm.role === "program_admin" ? "program_admin" : "viewer";
    const targetProgram = program.id;
    if (!accountForm.fullName.trim() || !accountForm.email.trim() || accountForm.password.length < 8) {
      setNotice("Enter a name, valid email, and password of at least 8 characters");
      return false;
    }
    try {
      const createdAccount = await createManagedUser(targetProgram, accountForm.email.trim(), accountForm.fullName.trim(), accountForm.password, role);
      setNotice(createdAccount.requiresEmailConfirmation
        ? `${role} account created; the user must confirm their email before signing in`
        : `${role} account created`);
      setAccountForm({ email: "", fullName: "", password: "", role: systemRole === "superadmin" ? "program_admin" : "viewer" });
      if (targetProgram) {
        try {
          setMembers(await loadMembers(targetProgram));
        } catch (error) {
          setNotice(error instanceof Error ? `Account created, but the user list could not be refreshed: ${error.message}` : "Account created, but the user list could not be refreshed");
        }
      }
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create account");
      return false;
    }
  };
  const updateMemberAccount = async () => {
    if (!memberDialog) return;
    const fullName = accountForm.fullName.trim();
    const role = accountForm.role === "program_admin" ? "program_admin" : "viewer";
    try {
      await manageProgramUser("update", program.id, memberDialog.user_id, { fullName, role });
      setMembers((current) => current.map((member) => member.id === memberDialog.id ? { ...member, role, profile: { ...member.profile!, full_name: fullName } } : member));
      setNotice("Account updated");
      setMemberDialog(null);
    } catch (error) {
      setNotice(getDatabaseErrorMessage(error));
    }
  };
  const deleteMemberAccount = async (member: ProgramMember) => {
    if (!window.confirm(`Remove ${member.profile?.full_name ?? "this user"} from ${program.acronym}? Their Supabase Auth account will remain active, but they will lose access to this program.`)) return;
    try {
      await manageProgramUser("delete", program.id, member.user_id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setNotice("Program access revoked. The Supabase Auth account remains active.");
    } catch (error) {
      setNotice(getDatabaseErrorMessage(error));
    }
  };
  const createProgramForSuperadmin = async () => {
    if (systemRole !== "superadmin" || !programForm.title.trim() || !programForm.acronym.trim()) {
      setNotice("Program name and acronym are required");
      return;
    }
    const normalizedAcronym = programForm.acronym.trim().toUpperCase();
    const existingProgram = programOptions.find((option) => option.acronym.trim().toUpperCase() === normalizedAcronym);
    if (existingProgram) {
      const message = `The acronym ${normalizedAcronym} is already used by ${existingProgram.title}. Choose a different acronym or open that program.`;
      setProgramCreateError(message);
      setNotice(message);
      return;
    }
    setProgramCreateError("");
    const programValues = {
      title: programForm.title.trim(), acronym: normalizedAcronym, agency_title: programForm.agency.trim() || "Department of Agriculture", office_subtitle: programForm.office.trim() || null,
      description: programForm.description.trim() || null, target_beneficiaries: programForm.beneficiaries.trim() || null, operating_units: programForm.units.split(",").map((item) => item.trim()).filter(Boolean), logo_url: null, theme_color: "#1c6653", accent_color: "#d8a642", is_active: true,
    };
    const workflowTemplate = programOptions.find((option) => option.acronym.toUpperCase() === programValues.acronym) ?? programOptions[0];
    const defaultWorkflow = workflowTemplate?.steps.filter((step) => step.active) ?? [];
    let createdProgram: import("./lib/database").DatabaseProgram | null = null;
    const createdSteps: WorkflowStep[] = [];
    try {
      createdProgram = await createProgram(programValues);
      const createdProgramRecord = createdProgram;
      const mappedProgram = mapDatabaseProgram(createdProgramRecord, []);
      setProgramOptions((current) => [...current, mappedProgram]);
      setProgram(mappedProgram);
      setSteps([]);
      setActivities([]);
      for (const [index, step] of defaultWorkflow.entries()) {
        const created = await createWorkflowStep({
          program_id: createdProgramRecord.id,
          step_order: index + 1,
          title: step.title,
          description: step.description,
          sub_steps: step.subSteps ?? [],
          assigned_role: step.assignedRole,
          required_documents: step.requiredDocuments.split(",").map((item) => item.trim()).filter(Boolean),
          sla_days: step.slaDays,
          status_tag: step.status,
          is_optional: step.isOptional,
          is_active: step.active,
        });
        createdSteps.push(mapDatabaseStep(created));
        const programWithStep = mapDatabaseProgram(createdProgramRecord, [...createdSteps]);
        setProgramOptions((current) => current.map((item) => item.id === programWithStep.id ? programWithStep : item));
        setProgram(programWithStep);
        setSteps(programWithStep.steps);
      }
      setProgramForm({ title: "", acronym: "", agency: "Department of Agriculture", office: "", description: "", beneficiaries: "", units: "", adminFullName: "", adminEmail: "", adminPassword: "" });
      setShowProgramCreateDialog(false);
      setNotice(defaultWorkflow.length
        ? "Program created; add its program admin from the program details"
        : "Program created without workflow steps; add its workflow in Settings, then assign its program admin");
    } catch (error) {
      const message = getDatabaseErrorMessage(error);
      setProgramCreateError(message);
      if (createdProgram) {
        setProgramForm({ title: "", acronym: "", agency: "Department of Agriculture", office: "", description: "", beneficiaries: "", units: "", adminFullName: "", adminEmail: "", adminPassword: "" });
        setShowProgramCreateDialog(false);
        setNotice(`Program was created, but a starter workflow step failed (${createdSteps.length}/${defaultWorkflow.length} created): ${message}. The program is available; continue adding steps in Settings → Fund workflow.`);
      } else {
        setNotice(`Program was not created: ${message}`);
      }
    }
  };
  useEffect(() => {
    if (!databaseConfigured || !session?.user) return;
    let mounted = true;
    const hydrateFromDatabase = async () => {
      try {
        const records = await loadPrograms();
        if (!mounted) return;
        if (records.length === 0) {
          setProgramOptions([]);
          setProgram(emptyProgramConfig);
          setSteps([]);
          setActivities([]);
          setActivitiesByProgram({});
          setAllocationsByProgram({});
          setNotice("No programs are seeded in the online database");
          return;
        }
        const options = await Promise.all(records.map(async (record) => {
          const recordsSteps = await loadWorkflowSteps(record.id);
          return mapDatabaseProgram(record, recordsSteps.map(mapDatabaseStep));
        }));
        const recordsByProgram = await Promise.all(records.map(async (record) => [record.id, (await loadActivities(record.id)).map((activity) => activity)] as const));
        const allocationResults = await Promise.all(records.map(async (record) => {
          try {
            return [record.id, await loadAnnualAllocations(record.id), null] as const;
          } catch (error) {
            return [record.id, [] as AnnualProgramAllocation[], error] as const;
          }
        }));
        const first = options[0];
        const firstActivities = recordsByProgram.find(([id]) => id === first.id)?.[1] ?? [];
        if (!mounted) return;
        setProgramOptions(options);
        setProgram(first);
        setSteps(first.steps);
        setActivities(firstActivities.map((activity) => mapDatabaseActivity(activity, first.steps, first.id)));
        setActivitiesByProgram(Object.fromEntries(recordsByProgram.map(([id, records]) => [id, records.map((activity) => mapDatabaseActivity(activity, options.find((option) => option.id === id)?.steps ?? [], id))])));
        setAllocationsByProgram(Object.fromEntries(allocationResults.map(([id, allocations]) => [id, allocations])));
        setSelectedId(first.steps[0]?.id ?? "");
        setSelectedActivityId(firstActivities[0]?.id ?? "");
        const allocationError = allocationResults.find(([, , error]) => error)?.[2];
        setNotice(allocationError
          ? `Loaded activities, but annual financial totals could not be fully loaded: ${allocationError instanceof Error ? allocationError.message : "check allocation access"}`
          : "Loaded from database");
      } catch (error) {
        if (mounted) setNotice(error instanceof Error ? `Database unavailable: ${error.message}` : "Database unavailable");
        console.error(error);
      }
    };
    void hydrateFromDatabase();
    return () => { mounted = false; };
  }, [session]);

  useEffect(() => {
    if (activeTab !== "beneficiaries" || !session?.user.id) return;
    if (systemRole !== "superadmin" && !program.id) return;

    let mounted = true;
    const scopeProgramId = systemRole === "superadmin"
      ? beneficiaryProgramFilter === "all" ? undefined : beneficiaryProgramFilter
      : program.id;
    void loadBeneficiaries(scopeProgramId)
      .then((records) => {
        if (mounted) {
          setBeneficiaryRecords(records);
          setBeneficiaryLoadedScope(scopeProgramId ?? "all");
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setBeneficiaryRecords([]);
          setBeneficiaryLoadedScope(scopeProgramId ?? "all");
          setNotice(`Beneficiary records could not be loaded: ${getDatabaseErrorMessage(error)}`);
          console.error(error);
        }
      });
    return () => { mounted = false; };
  }, [activeTab, beneficiaryProgramFilter, program.id, session?.user.id, systemRole]);

  useEffect(() => {
    if (activeTab !== "calendar" || !databaseConfigured || !session?.user.id || !program.id) {
      return;
    }

    let mounted = true;
    void loadCalendarDayNotes(program.id, calendarDays[0].key, calendarDays[calendarDays.length - 1].key)
      .then((records) => {
        if (mounted) {
          setCalendarDayNotes((current) => ({
            ...current,
            ...Object.fromEntries(records.map((record) => [`${record.program_id}:${record.note_date}`, record])),
          }));
          setCalendarNotesLoadedScope(calendarNotesScope);
          setCalendarNotesLoadErrorScope(null);
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setCalendarNotesLoadErrorScope(calendarNotesScope);
          setNotice(`Calendar notes could not be loaded: ${getDatabaseErrorMessage(error)}`);
          console.error(error);
        }
      });
    return () => { mounted = false; };
  }, [activeTab, calendarDays, calendarNotesReloadToken, calendarNotesScope, program.id, session?.user.id]);

  const updateProgram = (field: "title" | "acronym" | "agency" | "office" | "description" | "beneficiaries" | "units" | "primary" | "accent" | "logo", value: string) => {
    if (!isAdmin) return;
    setProgram((current) => ({ ...current, [field]: value }));
    setSaved(false);
    if (databaseConfigured) {
      const databaseField = { title: "title", acronym: "acronym", agency: "agency_title", office: "office_subtitle", description: "description", beneficiaries: "target_beneficiaries", units: "operating_units", primary: "theme_color", accent: "accent_color", logo: "logo_url" }[field];
      const databaseValue = field === "units" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value;
      void updateDatabaseProgram(program.id, { [databaseField]: databaseValue }).catch((error: unknown) => {
        setNotice(`Program update was not saved: ${getDatabaseErrorMessage(error)}`);
      });
    }
  };
  const saveProgramChanges = async () => {
    if (!isAdmin || !program.id) {
      setNotice("Program changes cannot be saved without an administrator role and a selected program");
      return false;
    }
    try {
      await updateDatabaseProgram(program.id, {
        title: program.title,
        acronym: program.acronym,
        agency_title: program.agency,
        office_subtitle: program.office || null,
        description: program.description || null,
        target_beneficiaries: program.beneficiaries || null,
        operating_units: program.units.split(",").map((unit) => unit.trim()).filter(Boolean),
        logo_url: program.logo || null,
        theme_color: program.primary,
        accent_color: program.accent,
      });
      setNotice("Program changes saved to the online database");
      setSaved(true);
      return true;
    } catch (error) {
      setNotice(`Program changes were not saved: ${getDatabaseErrorMessage(error)}`);
      return false;
    }
  };
  const updateStep = (
    field: "title" | "description" | "assignedRole" | "requiredDocuments" | "slaDays" | "status" | "isOptional" | "active" | "subSteps",
    value: string | number | boolean | string[],
  ) => {
    const nextSteps = steps.map((step) =>
      step.id === selectedId ? { ...step, [field]: value } : step,
    );
    setSteps(nextSteps);
    setProgramOptions((programs) => programs.map((item) => item.id === program.id ? { ...item, steps: nextSteps } : item));
    setProgram((currentProgram) => currentProgram.id === program.id ? { ...currentProgram, steps: nextSteps } : currentProgram);
    setSaved(false);
    if (databaseConfigured && !selectedId.startsWith("step-") && !stepDialogEditing) {
      const databaseField = { title: "title", description: "description", assignedRole: "assigned_role", requiredDocuments: "required_documents", slaDays: "sla_days", status: "status_tag", isOptional: "is_optional", active: "is_active", subSteps: "sub_steps" }[field];
      const databaseValue = field === "requiredDocuments" ? String(value).split(",").map((item) => item.trim()).filter(Boolean) : value;
      void updateWorkflowStep(selectedId, { [databaseField]: databaseValue }).catch((error: unknown) => {
        setNotice(`Workflow update was not saved: ${getDatabaseErrorMessage(error)}`);
      });
    }
  };
  const saveStepChanges = async () => {
    const step = steps.find((item) => item.id === selectedId);
    if (!step) return;
    try {
      await updateWorkflowStep(selectedId, {
        title: step.title,
        description: step.description,
        assigned_role: step.assignedRole,
        required_documents: step.requiredDocuments.split(",").map((item) => item.trim()).filter(Boolean),
        sla_days: step.slaDays,
        status_tag: step.status,
        is_optional: step.isOptional,
        is_active: step.active,
        sub_steps: step.subSteps ?? [],
      });
    } catch (error) {
      setNotice(`Workflow step was not saved: ${getDatabaseErrorMessage(error)}`);
      return;
    }
    setStepDialogEditing(false);
    setShowStepDialog(false);
    setNotice("Workflow step saved");
  };
  const moveStep = async (direction: -1 | 1) => {
    const index = steps.findIndex((step) => step.id === selectedId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) return;
    const nextSteps = [...steps];
    [nextSteps[index], nextSteps[nextIndex]] = [
      nextSteps[nextIndex],
      nextSteps[index],
    ];
    try {
      await reorderWorkflowSteps(program.id, nextSteps.map((step) => step.id));
      setSteps(nextSteps);
      setProgramOptions((programs) => programs.map((item) => item.id === program.id ? { ...item, steps: nextSteps } : item));
      setProgram((current) => current.id === program.id ? { ...current, steps: nextSteps } : current);
      setSaved(false);
    } catch (error) {
      setNotice(`Workflow order was not saved: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const addStep = async () => {
    const id = `step-${Date.now()}`;
    const draftStep: WorkflowStep = {
      id,
      title: "New workflow step",
      description: "Describe the activity, decision, or hand-off managed in this stage.",
      assignedRole: "Assign a responsible unit",
      requiredDocuments: "Add required form or attachment",
      slaDays: 5,
      status: "Pending",
      isOptional: false,
      active: true,
      subSteps: ["Complete this step", "Record the result"],
    };
    if (databaseConfigured) {
      try {
        const created = await createWorkflowStep({ program_id: program.id, step_order: steps.length + 1, title: draftStep.title, description: draftStep.description, sub_steps: draftStep.subSteps ?? [], assigned_role: draftStep.assignedRole, required_documents: draftStep.requiredDocuments.split(","), sla_days: draftStep.slaDays, status_tag: draftStep.status, is_optional: false, is_active: true });
        const mapped = mapDatabaseStep(created);
        setSteps((current) => [...current, mapped]);
        setProgram((current) => current.id === program.id ? { ...current, steps: [...current.steps, mapped] } : current);
        setProgramOptions((current) => current.map((item) => item.id === program.id ? { ...item, steps: [...item.steps, mapped] } : item));
        setSelectedId(mapped.id);
      } catch (error) {
        setNotice(`Workflow step was not created: ${getDatabaseErrorMessage(error)}`);
        return;
      }
    } else {
      const nextSteps = [...steps, draftStep];
      setSteps(nextSteps);
      setProgramOptions((programs) => programs.map((item) => item.id === program.id ? { ...item, steps: nextSteps } : item));
      setProgram((currentProgram) => currentProgram.id === program.id ? { ...currentProgram, steps: nextSteps } : currentProgram);
      setSelectedId(id);
    }
    setActiveTab("settings");
    setSettingsSection("fund-workflow");
    setStepDialogEditing(true);
    setShowStepDialog(true);
    setSaved(false);
  };
  const updateSubStep = (index: number, value: string) => {
    const subSteps = [...(selectedStep?.subSteps ?? [])];
    subSteps[index] = value;
    updateStep("subSteps", subSteps);
  };
  const addSubStep = () => {
    updateStep("subSteps", [...(selectedStep?.subSteps ?? []), "New substep"]);
  };
  const removeSubStep = (index: number) => {
    updateStep("subSteps", (selectedStep?.subSteps ?? []).filter((_, itemIndex) => itemIndex !== index));
  };
  const handleLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;
    const file = event.target.files?.[0];
    if (file) {
      setProgram((current) => ({
        ...current,
        logo: URL.createObjectURL(file),
      }));
      setSaved(false);
    }
  };
  const handleBanner = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setNotice(`${file.name} selected as the program banner`);
      setSaved(false);
    }
  };
  const selectProgram = (id: string) => {
    const nextProgram = programOptions.find((item) => item.id === id);
    if (!nextProgram) return;
    setDashboardProgramFilter(id);
    setProgramRole("viewer");
    setAnnualAllocations([]);
    setProcurementPlanItems([]);
    setProcurementPlanSheet(null);
    setProcurementPlanYears([]);
    setProcurementPlanDrafts({});
    if (databaseConfigured) {
      void (async () => {
        try {
          const recordsSteps = (await loadWorkflowSteps(id)).map(mapDatabaseStep);
          const [recordsActivities, recordsAllocations] = await Promise.all([loadActivities(id), loadAnnualAllocations(id)]);
          const databaseProgram = { ...nextProgram, steps: recordsSteps };
          setProgram(databaseProgram);
          setSteps(recordsSteps);
          setActivities(recordsActivities.map((activity) => mapDatabaseActivity(activity, recordsSteps, id)));
          setAnnualAllocations(recordsAllocations);
          setAllocationsByProgram((current) => ({ ...current, [id]: recordsAllocations }));
          setSelectedId(recordsSteps[0]?.id ?? "");
          setSelectedActivityId(recordsActivities[0]?.id ?? "");
          setActivitiesByProgram((current) => ({
            ...current,
            [id]: recordsActivities.map((activity) => mapDatabaseActivity(activity, recordsSteps, id)),
          }));
          setNotice(`${databaseProgram.acronym} workspace opened`);
          return;
        } catch (error) {
          console.error(error);
          setNotice(`Could not load ${nextProgram.acronym} financial records: ${getDatabaseErrorMessage(error)}`);
        }
      })();
      return;
    }
  };
  const openProgramWorkspace = (id: string) => {
    if (!programOptions.some((item) => item.id === id)) return;
    setShowProgramDetailDialog(false);
    selectProgram(id);
    setActiveTab("finance");
  };
  const saveActivity = async () => {
    if (!editingActivityId) {
      setNotice("Create activities by saving their projects in Finance → APP.");
      return;
    }
    const existingActivity = activities.find((item) => item.id === editingActivityId);
    if (!existingActivity) {
      setNotice("The activity being edited is no longer available. Refresh the activity register and try again.");
      return;
    }
    if (!newActivity.name.trim()) {
      setNotice("Activity name is required");
      return;
    }
    if (!newActivity.startDate && !existingActivity.fiscalYear) {
      setNotice("Activity start date is required");
      return;
    }
    if (newActivity.endDate && newActivity.endDate < newActivity.startDate) {
      setNotice("Target end date must be after the start date");
      return;
    }
    const budget = canManageFinance ? Number(newActivity.budget) || 0 : existingActivity.budget;
    const spent = canManageFinance ? Number(newActivity.spent) || 0 : existingActivity.spent;
    if (budget < 0 || spent < 0 || spent > budget) {
      setNotice("Obligations must be between zero and the approved activity budget");
      return;
    }
    let unitemizedObligations = existingActivity.unitemizedObligations;
    if (canManageFinance) {
      try {
        const procurementRecords = await loadProcurementItems(existingActivity.id);
        const supplierObligations = procurementRecords
          .filter((item) => item.obligation_status === "Partially obligated" || item.obligation_status === "Obligated")
          .reduce((total, item) => total + Number(item.obligated_amount), 0);
        if (spent < supplierObligations) {
          setNotice(`Activity obligations cannot be less than the ${supplierObligations.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} already assigned to suppliers`);
          return;
        }
        unitemizedObligations = spent - supplierObligations;
      } catch (error) {
        setNotice(`Could not verify supplier obligations: ${getDatabaseErrorMessage(error)}`);
        return;
      }
    }
    const activity: Activity = {
      ...existingActivity,
      name: newActivity.name.trim(),
      location: newActivity.location.trim(),
      startDate: newActivity.startDate,
      endDate: newActivity.endDate,
      fiscalYear: newActivity.startDate ? Number(newActivity.startDate.slice(0, 4)) : existingActivity.fiscalYear,
      budget,
      spent,
      unitemizedObligations,
      activityDesign: newActivity.activityDesign.trim(),
      status: getActivityStatus(steps, newActivity.currentStep || steps[0]?.title || "Activity Planning", newActivity.currentSubStep || ""),
      currentStep: newActivity.currentStep || steps[0]?.title || "Activity Planning",
      currentSubStep: newActivity.currentSubStep || steps.find((step) => step.title === (newActivity.currentStep || steps[0]?.title))?.subSteps?.[0] || "",
    };
    try {
      const currentStepId = steps.find((step) => step.title === activity.currentStep)?.id ?? null;
      const databaseValues = {
        title: activity.name,
        location: activity.location || null,
        start_date: activity.startDate || null,
        target_end_date: activity.endDate || null,
        fiscal_year: activity.fiscalYear ?? null,
        approved_budget: activity.budget,
        recorded_spending: activity.spent,
        unitemized_obligations: activity.unitemizedObligations,
        status: activity.status,
        current_step_id: currentStepId,
        current_sub_step: activity.currentSubStep ?? null,
        step_remarks: activity.stepRemarks ?? {},
        activity_design: activity.activityDesign ?? "",
        completed_sub_steps: activity.completedSubSteps ?? {},
      };
      await updateDatabaseActivity(editingActivityId, databaseValues);
      setActivities((current) => current.map((item) => item.id === editingActivityId ? activity : item));
      setActivitiesByProgram((current) => ({
        ...current,
        [program.id]: (current[program.id] ?? []).map((item) => item.id === editingActivityId ? activity : item),
      }));
      setSelectedActivityId(editingActivityId);
      setNotice("Activity updated in the online database");
    } catch (error) {
      setNotice(`Activity was not saved: ${getDatabaseErrorMessage(error)}`);
      return;
    }
    setNewActivity({
      name: "",
      location: "",
      startDate: "",
      endDate: "",
      budget: "",
      spent: "0",
      activityDesign: "",
      status: "Planning",
      currentStep: "",
      currentSubStep: "",
    });
    setEditingActivityId(null);
    setShowActivityForm(false);
    setSaved(false);
  };
  const editActivity = (activity: Activity) => {
    if (activity.activityCode.startsWith("APP-")) {
      setNotice("Edit this activity's title, schedule, or budget in Finance → APP.");
      return;
    }
    setEditingActivityId(activity.id);
    setNewActivity({
      name: activity.name,
      location: activity.location,
      startDate: activity.startDate,
      endDate: activity.endDate,
      budget: String(activity.budget),
      spent: String(activity.spent),
      status: activity.status,
      currentStep: activity.currentStep,
      currentSubStep: activity.currentSubStep ?? steps.find((step) => step.title === activity.currentStep)?.subSteps?.[0] ?? "",
      activityDesign: activity.activityDesign ?? "",
    });
    setActivityDialogTab("workflow");
    setShowActivityDialog(false);
    setActiveTab("activities");
    setShowActivityForm(true);
  };
  const deleteActivity = async (id: string) => {
    const activity = activities.find((item) => item.id === id);
    if (activity?.activityCode.startsWith("APP-")) {
      setNotice("APP-linked activities cannot be deleted here. Remove the project from Finance → APP instead.");
      return;
    }
    try {
      await deleteDatabaseActivity(id);
      setActivities((current) => current.filter((activity) => activity.id !== id));
      setActivitiesByProgram((current) => ({ ...current, [program.id]: (current[program.id] ?? []).filter((activity) => activity.id !== id) }));
      setSelectedActivityId("");
      setNotice("Activity deleted from the online database");
    } catch (error) {
      setNotice(`Activity was not deleted: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const selectedActivity =
    activities.find((activity) => activity.id === selectedActivityId) ??
    activities[0];
  const selectedActivityWorkflowStep = selectedActivity
    ? activeSteps.find((step) => step.id === workflowStepSelections[selectedActivity.id])
      ?? activeSteps.find((step) => step.title === selectedActivity.currentStep)
      ?? activeSteps[0]
    : undefined;
  const selectedActivityWorkflowIndex = selectedActivityWorkflowStep ? activeSteps.indexOf(selectedActivityWorkflowStep) : -1;
  const beneficiaryScopeKey = systemRole === "superadmin" ? beneficiaryProgramFilter : program.id;
  const beneficiaryTableLoading = Boolean(beneficiaryScopeKey) && beneficiaryLoadedScope !== beneficiaryScopeKey;
  const visibleBeneficiaryRecords = beneficiaryTableLoading || !beneficiaryScopeKey ? [] : beneficiaryRecords;
  const filteredBeneficiaryRecords = visibleBeneficiaryRecords.filter((record) => {
    const query = beneficiarySearch.trim().toLowerCase();
    if (!query) return true;
    const programName = programOptions.find((option) => option.id === record.program_id)?.title ?? "";
    const activityNames = (activitiesByProgram[record.program_id] ?? [])
      .filter((activity) => record.activity_ids.includes(activity.id))
      .map((activity) => activity.name);
    return [
      record.beneficiary_name,
      record.beneficiary_acronym,
      record.fca_category,
      record.membership_count?.toString(),
      record.contact_person,
      record.contact_number,
      record.additional_details,
      record.province,
      record.municipality,
      record.barangay,
      record.other_assistance_interventions,
      programName,
      ...activityNames,
    ].some((value) => value?.toLowerCase().includes(query));
  });
  const filteredActivities = activities.filter((activity) => {
    const query = activitySearch.trim().toLowerCase();
    if (!query) return true;
    return [activity.name, activity.location, activity.status, activity.currentStep]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const saveActivityChanges = async () => {
    if (!selectedActivity) return;
    const stepRemarks = { ...(selectedActivity.stepRemarks ?? {}) };
    activeSteps.forEach((step) => {
      const draftKey = `${selectedActivity.id}:${step.id}`;
      if (draftKey in remarkDrafts) stepRemarks[step.id] = remarkDrafts[draftKey];
    });
    try {
      const currentStepId = steps.find((step) => step.title === selectedActivity.currentStep)?.id ?? null;
      await updateDatabaseActivity(selectedActivity.id, {
        status: selectedActivity.status,
        current_step_id: currentStepId,
        current_sub_step: selectedActivity.currentSubStep ?? null,
        step_remarks: stepRemarks,
        completed_sub_steps: selectedActivity.completedSubSteps ?? {},
      });
      setActivities((current) => current.map((activity) => activity.id === selectedActivity.id ? { ...activity, stepRemarks } : activity));
      setNotice("Activity changes saved to the online database");
    } catch (error) {
      setNotice(`Activity changes were not saved: ${getDatabaseErrorMessage(error)}`);
    }
    setSaved(false);
  };
  const saveActivityDesign = async () => {
    if (!selectedActivity || !canEdit) return;
    const activityDesign = selectedActivity.activityDesign ?? "";
    try {
      await updateDatabaseActivity(selectedActivity.id, { activity_design: activityDesign });
      setActivities((current) => current.map((activity) => activity.id === selectedActivity.id ? { ...activity, activityDesign } : activity));
      setNotice("Activity design saved to the online database");
    } catch (error) {
      setNotice(`Activity design was not saved: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const saveCalendarNoteDraft = async () => {
    if (!calendarDialogDay || !program.id || !canEdit || !session?.user.id) return;
    const noteKey = `${program.id}:${calendarDialogDay}`;
    const noteDraft = calendarNoteDrafts[noteKey] ?? calendarDayNotes[noteKey]?.note ?? "";
    if (noteDraft.trim().length > 4000) {
      setNotice("Calendar notes must be 4,000 characters or fewer");
      return;
    }
    setCalendarNoteSaving(true);
    try {
      const note = await saveCalendarDayNote(program.id, calendarDialogDay, noteDraft);
      setCalendarDayNotes((current) => {
        const next = { ...current };
        if (note) next[noteKey] = note;
        else delete next[noteKey];
        return next;
      });
      setCalendarNoteDrafts((current) => ({ ...current, [noteKey]: note?.note ?? "" }));
      setNotice(note ? "Day note saved" : "Day note removed");
    } catch (error) {
      setNotice(`Day note was not saved: ${getDatabaseErrorMessage(error)}`);
    } finally {
      setCalendarNoteSaving(false);
    }
  };
  const editCalendarSchedule = (activity: Activity) => {
    const isAppSchedule = activity.activityCode.startsWith("APP-");
    if (!canEdit || (isAppSchedule && !isAdmin)) return;
    setCalendarScheduleEditingId(activity.id);
    setCalendarScheduleDraft({
      startDate: isAppSchedule ? activity.startDate.slice(0, 7) : activity.startDate,
      endDate: isAppSchedule ? activity.endDate.slice(0, 7) : activity.endDate,
      isAppSchedule,
    });
  };
  const saveCalendarSchedule = async (activity: Activity) => {
    if (!calendarScheduleDraft || !canEdit || !program.id || (activity.activityCode.startsWith("APP-") && !isAdmin)) return;
    const { startDate: draftStart, endDate: draftEnd, isAppSchedule } = calendarScheduleDraft;
    if (!draftStart) {
      setNotice("An activity start date is required");
      return;
    }
    if (draftEnd && draftEnd < draftStart) {
      setNotice("The activity end date must be on or after its start date");
      return;
    }
    const startDate = isAppSchedule ? `${draftStart}-01` : draftStart;
    const endDate = draftEnd ? (isAppSchedule ? `${draftEnd}-01` : draftEnd) : "";
    setCalendarScheduleSaving(true);
    try {
      await saveCalendarActivitySchedule(activity.id, program.id, startDate, endDate);
      const updatedActivity = { ...activity, startDate, endDate, fiscalYear: isAppSchedule ? activity.fiscalYear : Number(startDate.slice(0, 4)) };
      setActivities((current) => current.map((item) => item.id === activity.id ? updatedActivity : item));
      setActivitiesByProgram((current) => ({
        ...current,
        [program.id]: (current[program.id] ?? []).map((item) => item.id === activity.id ? updatedActivity : item),
      }));
      setCalendarScheduleEditingId(null);
      setCalendarScheduleDraft(null);
      setNotice("Activity schedule saved");
    } catch (error) {
      setNotice(`Activity schedule was not saved: ${getDatabaseErrorMessage(error)}`);
    } finally {
      setCalendarScheduleSaving(false);
    }
  };
  const allocationRowDraftKey = (row: AnnualProgramAllocation | null) => row?.id ?? `new:${program.id}:${selectedFiscalYear}`;
  const updateAllocationRowDraft = (row: AnnualProgramAllocation | null, field: keyof AllocationDraft, value: string) => {
    const key = allocationRowDraftKey(row);
    setAllocationRowDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? (row ? allocationToDraft(row) : createEmptyAllocationDraft())), [field]: value },
    }));
  };
  const saveAllocationRow = async (row: AnnualProgramAllocation | null) => {
    if (!canManageFinance) {
      setNotice("Only this program's program admin can edit financial records");
      return;
    }
    const rowKey = allocationRowDraftKey(row);
    const draft = allocationRowDrafts[rowKey] ?? (row ? allocationToDraft(row) : createEmptyAllocationDraft());
    const numberFields: Array<keyof Pick<AllocationDraft, "appropriation" | "allotment_received" | "disbursements" | "accounts_payable" | "cash_advances" | "liquidation" | "savings">> = [
      "appropriation", "allotment_received", "disbursements",
      "accounts_payable", "cash_advances", "liquidation", "savings",
    ];
    const amounts = Object.fromEntries(numberFields.map((field) => [field, Number(draft[field])])) as Record<typeof numberFields[number], number>;
    if (!draft.fund_source.trim() || numberFields.some((field) => !Number.isFinite(amounts[field]) || amounts[field] < 0)) {
      setNotice("Enter a fund source and valid non-negative amounts");
      return;
    }
    if (amounts.allotment_received > amounts.appropriation || amounts.disbursements > amounts.allotment_received) {
      setNotice("Check the financial ceilings: allotments and disbursements cannot exceed the appropriation and received allotment");
      return;
    }
    setAllocationRowSavingId(rowKey);
    try {
      const savedRow = await saveAnnualAllocation({
        id: row?.id,
        program_id: row?.program_id ?? program.id,
        fiscal_year: row?.fiscal_year ?? selectedFiscalYear,
        fund_source: draft.fund_source.trim(),
        allotment_reference: draft.allotment_reference.trim() || null,
        obligation_reference: row?.obligation_reference ?? null,
        disbursement_reference: draft.disbursement_reference.trim() || null,
        appropriation: amounts.appropriation,
        allotment_received: amounts.allotment_received,
        obligations: row?.obligations ?? 0,
        disbursements: amounts.disbursements,
        accounts_payable: amounts.accounts_payable,
        cash_advances: amounts.cash_advances,
        liquidation: amounts.liquidation,
        savings: amounts.savings,
        remarks: draft.remarks.trim() || null,
      });
      setAnnualAllocations((current) => [...current.filter((item) => item.id !== savedRow.id), savedRow].sort((a, b) => b.fiscal_year - a.fiscal_year || a.fund_source.localeCompare(b.fund_source)));
      setAllocationsByProgram((current) => ({
        ...current,
        [savedRow.program_id]: [...(current[savedRow.program_id] ?? []).filter((item) => item.id !== savedRow.id), savedRow].sort((a, b) => b.fiscal_year - a.fiscal_year || a.fund_source.localeCompare(b.fund_source)),
      }));
      setAllocationRowDrafts((current) => {
        const next = { ...current };
        delete next[rowKey];
        return next;
      });
      setNotice(`FY ${savedRow.fiscal_year} allocation row saved`);
    } catch (error) {
      setNotice(`Allocation row was not saved: ${getDatabaseErrorMessage(error)}`);
    } finally {
      setAllocationRowSavingId(null);
    }
  };
  const removeAllocation = async (id: string) => {
    if (!canManageFinance) {
      setNotice("Only this program's program admin can edit financial records");
      return;
    }
    try {
      await deleteAnnualAllocation(id);
      setAnnualAllocations((current) => current.filter((row) => row.id !== id));
      setAllocationsByProgram((current) => ({
        ...current,
        [program.id]: (current[program.id] ?? []).filter((row) => row.id !== id),
      }));
      setAllocationRowDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setNotice("Annual allocation deleted");
    } catch (error) {
      setNotice(`Could not delete allocation: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const procurementPlanRowKey = (row: ProcurementPlanItem | null) => row?.id ?? `new:${program.id}:${selectedFiscalYear}:APP`;
  const refreshProgramActivities = async () => {
    const records = await loadActivities(program.id);
    const mapped = records.map((activity) => mapDatabaseActivity(activity, steps, program.id));
    setActivities(mapped);
    setActivitiesByProgram((current) => ({ ...current, [program.id]: mapped }));
  };
  const updateProcurementPlanDraft = (row: ProcurementPlanItem | null, field: keyof AppPlanRowDraft, value: string | boolean) => {
    const key = procurementPlanRowKey(row);
    setProcurementPlanDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? (row ? appPlanItemToDraft(row) : createEmptyAppPlanRowDraft())), [field]: value },
    }));
  };
  const saveProcurementPlanHeader = async () => {
    if (!canManageFinance) {
      setNotice("Only this program's program admin can edit financial records");
      return;
    }
    try {
      const sheet = await saveProcurementPlanSheet({
        program_id: program.id,
        fiscal_year: selectedFiscalYear,
        plan_type: "APP",
        ...procurementPlanHeader,
      });
      setProcurementPlanSheet(sheet);
      setProcurementPlanYears((current) => Array.from(new Set([selectedFiscalYear, ...current])).sort((a, b) => b - a));
      setNotice(`FY ${selectedFiscalYear} APP details saved`);
    } catch (error) {
      setNotice(`APP details were not saved: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const saveProcurementPlanRow = async (row: ProcurementPlanItem | null): Promise<boolean> => {
    if (!canManageFinance) {
      setNotice("Only this program's program admin can edit financial records");
      return false;
    }
    const rowKey = procurementPlanRowKey(row);
    const draft = procurementPlanDrafts[rowKey] ?? (row ? appPlanItemToDraft(row) : createEmptyAppPlanRowDraft());
    const estimatedBudget = Number(draft.estimated_budget);
    if (!draft.project_title.trim() || !draft.implementing_unit.trim() || !Number.isFinite(estimatedBudget) || estimatedBudget < 0) {
      setNotice("Enter a project title, implementing unit, and a valid non-negative estimated budget");
      return false;
    }
    const startDate = draft.procurement_start ? `${draft.procurement_start}-01` : null;
    const endDate = draft.procurement_end ? `${draft.procurement_end}-01` : null;
    if (startDate && endDate && startDate > endDate) {
      setNotice("The procurement end month must be the same as or later than the start month");
      return false;
    }
    setProcurementPlanSavingId(rowKey);
    try {
      const sheet = await saveProcurementPlanSheet({
        program_id: program.id,
        fiscal_year: selectedFiscalYear,
        plan_type: "APP",
        ...procurementPlanHeader,
      });
      const savedRow = await saveProcurementPlanItem({
        id: row?.id,
        plan_id: sheet.id,
        project_title: draft.project_title.trim(),
        implementing_unit: draft.implementing_unit.trim(),
        project_description: draft.project_description.trim(),
        procurement_mode: draft.procurement_mode.trim(),
        early_procurement_activity: draft.early_procurement_activity,
        bid_evaluation_criteria: draft.bid_evaluation_criteria.trim(),
        procurement_start: startDate,
        procurement_end: endDate,
        source_of_fund: draft.source_of_fund.trim(),
        estimated_budget: estimatedBudget,
        procurement_strategy: draft.procurement_strategy.trim(),
        remarks: draft.remarks.trim(),
      });
      setProcurementPlanSheet(sheet);
      setProcurementPlanYears((current) => Array.from(new Set([selectedFiscalYear, ...current])).sort((a, b) => b - a));
      setProcurementPlanItems((current) => [...current.filter((item) => item.id !== savedRow.id), savedRow].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      setProcurementPlanDrafts((current) => {
        const next = { ...current };
        delete next[rowKey];
        return next;
      });
      setNotice(`FY ${selectedFiscalYear} APP project saved`);
      try {
        await refreshProgramActivities();
      } catch (error) {
        setNotice(`APP project saved, but its activity could not be refreshed: ${getDatabaseErrorMessage(error)}`);
      }
      return true;
    } catch (error) {
      setNotice(`APP project was not saved: ${getDatabaseErrorMessage(error)}`);
      return false;
    } finally {
      setProcurementPlanSavingId(null);
    }
  };
  const deleteProcurementPlanRow = async (row: ProcurementPlanItem) => {
    if (!canManageFinance) {
      setNotice("Only this program's program admin can edit financial records");
      return;
    }
    try {
      await deleteProcurementPlanItem(row.id);
      setProcurementPlanItems((current) => current.filter((item) => item.id !== row.id));
      setProcurementPlanDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setNotice(`FY ${selectedFiscalYear} APP project removed`);
    } catch (error) {
      setNotice(`APP project was not deleted: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const exportAppPlanCsv = () => {
    const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      appPlanCsvColumns.map(([key]) => csvCell(key)).join(","),
      ...procurementPlanItems.map((item) => appPlanCsvColumns.map(([key]) => {
        const value = item[key];
        if (key === "early_procurement_activity") return csvCell(value ? "Yes" : "No");
        if (key === "procurement_start" || key === "procurement_end") return csvCell(String(value ?? "").slice(0, 7));
        return csvCell(String(value ?? ""));
      }).join(",")),
    ];
    const blobUrl = URL.createObjectURL(new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${program.acronym}-APP-FY${selectedFiscalYear}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };
  const importAppPlanCsv = async (file: File) => {
    if (!canManageFinance) {
      setNotice("Only this program's program admin can import APP records");
      return;
    }
    setProcurementPlanImporting(true);
    let importedCount = 0;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("Choose a CSV file with a header row and at least one project.");
      const normalizedHeaders = rows[0].map((header) => header.trim().toLowerCase());
      const columnIndexes = appPlanCsvColumns.map(([key, label]) => {
        const aliases = [key.toLowerCase(), label.toLowerCase()];
        return normalizedHeaders.findIndex((header) => aliases.includes(header));
      });
      const missingColumns = appPlanCsvColumns.filter((_, index) => columnIndexes[index] < 0).map((column) => column[1]);
      if (missingColumns.length) throw new Error(`CSV is missing required APP columns: ${missingColumns.join(", ")}`);
      const parseMonth = (value: string, label: string) => {
        if (!value.trim()) return null;
        const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim());
        if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error(`${label} must use YYYY-MM format.`);
        return `${match[1]}-${match[2]}-01`;
      };
      const importedDrafts = rows.slice(1).map((values, rowIndex): AppPlanRowDraft => {
        const getValue = (column: number) => values[columnIndexes[column]]?.trim() ?? "";
        const budgetValue = getValue(9);
        const budget = Number(budgetValue);
        const earlyActivity = getValue(4).toLowerCase();
        if (!getValue(0) || !getValue(1) || !budgetValue || !Number.isFinite(budget) || budget < 0) {
          throw new Error(`CSV row ${rowIndex + 2} needs a project title, implementing unit, and valid non-negative budget.`);
        }
        if (!["yes", "no", "true", "false", "1", "0"].includes(earlyActivity.toLowerCase())) {
          throw new Error(`CSV row ${rowIndex + 2} has an invalid early procurement activity value; use Yes or No.`);
        }
        const start = parseMonth(getValue(6), `CSV row ${rowIndex + 2} procurement start`);
        const end = parseMonth(getValue(7), `CSV row ${rowIndex + 2} procurement end`);
        if (start && end && start > end) throw new Error(`CSV row ${rowIndex + 2} has an end month before its start month.`);
        return {
          project_title: getValue(0),
          implementing_unit: getValue(1),
          project_description: getValue(2),
          procurement_mode: getValue(3),
          early_procurement_activity: ["yes", "true", "1"].includes(earlyActivity),
          bid_evaluation_criteria: getValue(5),
          procurement_start: start?.slice(0, 7) ?? "",
          procurement_end: end?.slice(0, 7) ?? "",
          source_of_fund: getValue(8),
          estimated_budget: String(budget),
          procurement_strategy: getValue(10),
          remarks: getValue(11),
        };
      });
      const sheet = await saveProcurementPlanSheet({
        program_id: program.id,
        fiscal_year: selectedFiscalYear,
        plan_type: "APP",
        ...procurementPlanHeader,
      });
      setProcurementPlanSheet(sheet);
      for (const draft of importedDrafts) {
        const savedItem = await saveProcurementPlanItem({
          plan_id: sheet.id,
          project_title: draft.project_title,
          implementing_unit: draft.implementing_unit,
          project_description: draft.project_description,
          procurement_mode: draft.procurement_mode,
          early_procurement_activity: draft.early_procurement_activity,
          bid_evaluation_criteria: draft.bid_evaluation_criteria,
          procurement_start: draft.procurement_start ? `${draft.procurement_start}-01` : null,
          procurement_end: draft.procurement_end ? `${draft.procurement_end}-01` : null,
          source_of_fund: draft.source_of_fund,
          estimated_budget: Number(draft.estimated_budget),
          procurement_strategy: draft.procurement_strategy,
          remarks: draft.remarks,
        });
        importedCount += 1;
        setProcurementPlanItems((current) => [...current, savedItem].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      }
      setProcurementPlanYears((current) => Array.from(new Set([selectedFiscalYear, ...current])).sort((a, b) => b - a));
      setNotice(`Imported ${importedCount} APP project${importedCount === 1 ? "" : "s"} into FY ${selectedFiscalYear}. Existing rows were kept.`);
      try {
        await refreshProgramActivities();
      } catch (error) {
        setNotice(`Imported ${importedCount} APP project${importedCount === 1 ? "" : "s"}, but linked activities could not be refreshed: ${getDatabaseErrorMessage(error)}`);
      }
    } catch (error) {
      const reason = getDatabaseErrorMessage(error);
      setNotice(importedCount
        ? `Imported ${importedCount} project${importedCount === 1 ? "" : "s"} before the import stopped: ${reason}`
        : `APP import failed: ${reason}`);
    } finally {
      setProcurementPlanImporting(false);
    }
  };
  const appPlanResizeHandle = (index: number) => (
    <span
      className="finance-column-resize-handle"
      role="separator"
      aria-label={`Resize APP column ${index + 1}`}
      aria-orientation="vertical"
      aria-valuenow={appPlanColumnWidths[index] ?? 160}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setAppColumnResize({ index, startX: event.clientX, startWidth: appPlanColumnWidths[index] ?? 160 });
      }}
      onPointerMove={(event) => {
        if (appColumnResize?.index !== index) return;
        const width = Math.max(120, appColumnResize.startWidth + event.clientX - appColumnResize.startX);
        setAppPlanColumnWidths((current) => current.map((currentWidth, columnIndex) => columnIndex === index ? width : currentWidth));
      }}
      onPointerUp={() => setAppColumnResize(null)}
      onPointerCancel={() => setAppColumnResize(null)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const change = event.key === "ArrowRight" ? 16 : -16;
        setAppPlanColumnWidths((current) => current.map((width, columnIndex) => columnIndex === index ? Math.max(120, width + change) : width));
      }}
    />
  );
  const updateProcurementDraft = (draftKey: string, updates: Partial<ProcurementDraft>) => {
    setProcurementDrafts((current) => current.map((draft) => draft.draftKey === draftKey ? { ...draft, ...updates } : draft));
  };
  const saveProcurementDraft = async (draft: ProcurementDraftEntry) => {
    if (!canManageFinance) {
      setNotice("Only this program's program admin can edit procurement financial records");
      return;
    }
    if (!selectedActivity || !draft.category.trim() || !draft.item_description.trim() || !draft.supplier_name.trim() || !draft.procurement_method.trim() || !draft.unit.trim()) {
      setNotice("Complete the category, item/service, supplier, procurement method, and unit for this line");
      return;
    }
    if (!Number.isFinite(draft.quantity) || !Number.isFinite(draft.unit_cost) || !Number.isFinite(draft.obligated_amount) || draft.quantity <= 0 || draft.unit_cost < 0 || draft.obligated_amount < 0) {
      setNotice("Quantity must be greater than zero; unit cost and obligated amount cannot be negative");
      return;
    }
    try {
      const { draftKey, ...procurementFields } = draft;
      const savedItem = await saveProcurementItem({
        ...procurementFields,
        program_id: program.id,
        activity_id: selectedActivity.id,
        category: "Other goods or services",
        item_description: draft.item_description.trim(),
        supplier_name: draft.supplier_name.trim(),
        procurement_method: draft.procurement_method.trim(),
        unit: draft.unit.trim(),
        workflow_step_id: null,
        obligated_amount: draft.obligated_amount,
        purchase_order_number: draft.purchase_order_number?.trim() || null,
        delivery_date: draft.delivery_date || null,
      });
      setProcurementItems((current) => [...current.filter((item) => item.id !== savedItem.id), savedItem]);
      setProcurementDrafts((current) => current.filter((entry) => entry.draftKey !== draftKey));
      try {
        await refreshProgramActivities();
        setNotice(draft.id ? "Supplier line updated; activity obligations and dashboard totals refreshed" : "Supplier line added; activity obligations and dashboard totals refreshed");
      } catch (error) {
        setNotice(`Supplier line saved, but activity totals could not be refreshed: ${getDatabaseErrorMessage(error)}`);
      }
    } catch (error) {
      setNotice(`Supplier line was not saved: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const removeProcurementItem = async (item: ProcurementItem) => {
    if (!canManageFinance) {
      setNotice("Only this program's program admin can edit procurement financial records");
      return;
    }
    try {
      await deleteProcurementItem(item.id);
      setProcurementItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      try {
        await refreshProgramActivities();
        setNotice("Supplier line deleted; activity obligations and dashboard totals refreshed");
      } catch (error) {
        setNotice(`Supplier line deleted, but activity totals could not be refreshed: ${getDatabaseErrorMessage(error)}`);
      }
    } catch (error) {
      setNotice(`Could not delete supplier line: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const supplierEstimatedTotal = procurementItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost), 0);
  const supplierObligationTotal = procurementItems
    .filter((item) => item.obligation_status === "Partially obligated" || item.obligation_status === "Obligated")
    .reduce((sum, item) => sum + Number(item.obligated_amount), 0);
  const workflowProcurementSummary = selectedActivity && procurementLoadedActivityId === selectedActivity.id ? (
    <section className="workflow-procurement-links">
      <strong>Supplier obligations · ₱{supplierObligationTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
      {procurementItems.length ? procurementItems.map((item) => <div key={item.id}>
        <span>{item.supplier_name}</span>
        <b>₱{Number(item.obligated_amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
        <small>{item.item_description} · {item.obligation_status}</small>
      </div>) : <small>No supplier obligations recorded for this activity.</small>}
    </section>
  ) : null;
  const procurementPanel = selectedActivity ? (
    <div className="procurement-panel">
      <div className="procurement-heading">
        <div><p className="eyebrow">Activity procurement plan</p><h3>Supplier and procurement lines</h3><p>Add a separate line for each supplier/package (food, transportation, lodging, supplies, and more).</p></div>
        <div className="procurement-totals"><span>Estimated <strong>₱{supplierEstimatedTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span><span>Supplier obligations <strong>₱{supplierObligationTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span><span>Activity obligations <strong>₱{selectedActivity.spent.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span></div>
      </div>
      {procurementLoadedActivityId !== selectedActivity.id ? <div className="empty-state">Loading supplier records…</div> : procurementItems.length ? <div className="procurement-items">{procurementItems.map((item) => (
        <article className="procurement-item" key={item.id}>
          <div><h4>{item.item_description}</h4><p>{item.supplier_name} · {item.procurement_method}</p><small>{item.obligation_status} · {item.delivery_status}{item.purchase_order_number ? ` · PO ${item.purchase_order_number}` : ""}{item.delivery_date ? ` · ${item.delivery_date}` : ""}</small></div>
          <div className="procurement-item-amount"><strong>Obligated ₱{Number(item.obligated_amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Estimated ₱{(Number(item.quantity) * Number(item.unit_cost)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {Number(item.quantity).toLocaleString()} {item.unit} × ₱{Number(item.unit_cost).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small></div>
          {canManageFinance && <div className="finance-row-actions"><button className="button secondary" onClick={() => setProcurementDrafts((current) => [...current.filter((draft) => draft.id !== item.id), { ...item, draftKey: crypto.randomUUID() }])}>Edit</button><button className="icon-button danger" aria-label={`Delete procurement item from ${item.supplier_name}`} onClick={() => void removeProcurementItem(item)}><Trash2 size={15} /></button></div>}
        </article>
      ))}</div> : <div className="empty-state">No procurement suppliers recorded for this activity.</div>}
      {canManageFinance && procurementLoadedActivityId === selectedActivity.id && <section className="procurement-form">
        <div className="procurement-form-heading"><div><h4>Supplier line entry</h4><p>Prepare multiple suppliers and save each line independently.</p></div><button type="button" className="button secondary" onClick={() => setProcurementDrafts((current) => [...current, createProcurementDraft()])}><Plus size={14} /> Add supplier line</button></div>
        <datalist id="procurement-methods"><option value="Competitive bidding" /><option value="Small Value Procurement" /><option value="Negotiated procurement" /><option value="Direct contracting" /><option value="Agency-to-agency" /><option value="Other method" /></datalist>
        {procurementDrafts.map((draft, index) => <div className="procurement-draft-line" key={draft.draftKey}>
          <h5>{draft.id ? "Edit supplier line" : `New supplier line ${index + 1}`}</h5>
          <div className="procurement-form-grid">
            <label>Item / service<input value={draft.item_description} onChange={(event) => updateProcurementDraft(draft.draftKey, { item_description: event.target.value })} placeholder="Describe the goods or service" /></label>
            <label>Supplier / service provider<input value={draft.supplier_name} onChange={(event) => updateProcurementDraft(draft.draftKey, { supplier_name: event.target.value })} placeholder="Registered supplier name" /></label>
            <label>Procurement method<input list="procurement-methods" value={draft.procurement_method} onChange={(event) => updateProcurementDraft(draft.draftKey, { procurement_method: event.target.value })} /></label>
            <label>PO / contract reference<input value={draft.purchase_order_number ?? ""} onChange={(event) => updateProcurementDraft(draft.draftKey, { purchase_order_number: event.target.value })} placeholder="Optional reference" /></label>
            <label>Quantity<input type="number" min="0.001" step="0.001" value={draft.quantity} onChange={(event) => updateProcurementDraft(draft.draftKey, { quantity: Number(event.target.value) })} /></label>
            <label>Unit<input value={draft.unit} onChange={(event) => updateProcurementDraft(draft.draftKey, { unit: event.target.value })} placeholder="lot, pax, unit, day" /></label>
            <label>Unit cost (₱)<input type="number" min="0" step="0.01" value={draft.unit_cost} onChange={(event) => updateProcurementDraft(draft.draftKey, { unit_cost: Number(event.target.value) })} /></label>
            <label>Obligation status<select value={draft.obligation_status} onChange={(event) => updateProcurementDraft(draft.draftKey, { obligation_status: event.target.value as ProcurementItem["obligation_status"] })}><option>Not obligated</option><option>Partially obligated</option><option>Obligated</option><option>Cancelled</option></select></label>
            <label>Obligated amount (₱)<input type="number" min="0" step="0.01" value={draft.obligated_amount} disabled={draft.obligation_status === "Not obligated" || draft.obligation_status === "Cancelled"} onChange={(event) => updateProcurementDraft(draft.draftKey, { obligated_amount: Number(event.target.value) })} /></label>
            <label>Delivery status<select value={draft.delivery_status} onChange={(event) => updateProcurementDraft(draft.draftKey, { delivery_status: event.target.value })}><option>For procurement</option><option>Purchase order issued</option><option>Partially delivered</option><option>Delivered</option><option>Inspected and accepted</option><option>Cancelled</option></select></label>
            <label>Delivery date<input type="date" value={draft.delivery_date ?? ""} onChange={(event) => updateProcurementDraft(draft.draftKey, { delivery_date: event.target.value || null })} /></label>
          </div>
          <div className="finance-form-actions"><button type="button" className="button secondary" onClick={() => setProcurementDrafts((current) => current.filter((entry) => entry.draftKey !== draft.draftKey))}>{draft.id ? "Cancel edit" : "Remove line"}</button><button type="button" className="button primary" onClick={() => void saveProcurementDraft(draft)}><Save size={14} /> {draft.id ? "Update supplier line" : "Save supplier line"}</button></div>
        </div>)}
      </section>}
    </div>
  ) : null;
  const toggleTimelineStep = (activityId: string, stepId: string, defaultExpanded: boolean) => {
    const key = `${activityId}:${stepId}`;
    setExpandedTimelineSteps((current) => ({ ...current, [key]: !(current[key] ?? defaultExpanded) }));
  };
  const getCompletedSubSteps = (activity: Activity, step: WorkflowStep, stepIndex: number, workflow = activeSteps) => {
    const explicit = activity.completedSubSteps?.[step.id];
    if (explicit) return Array.from(new Set(explicit.filter((item) => (step.subSteps ?? []).includes(item))));
    const currentStepIndex = workflow.findIndex((item) => item.title === activity.currentStep);
    const currentSubStepIndex = (workflow[currentStepIndex]?.subSteps ?? []).indexOf(activity.currentSubStep ?? "");
    if (stepIndex < currentStepIndex) return step.subSteps ?? [];
    if (stepIndex === currentStepIndex && currentSubStepIndex >= 0) return (step.subSteps ?? []).slice(0, currentSubStepIndex + 1);
    return [];
  };
  const getActivityProgressForWorkflow = (activity: Activity, workflow: WorkflowStep[]) => {
    const workflowSteps = workflow.filter((step) => step.active);
    if (!workflowSteps.length) return activity.status === "Completed" ? 100 : 0;
    if (activity.status === "Completed") return 100;

    const currentStepIndex = workflowSteps.findIndex((step) => step.title === activity.currentStep);
    const totalUnits = workflowSteps.reduce((total, step) => total + Math.max(1, step.subSteps?.length ?? 0), 0);
    const completedUnits = workflowSteps.reduce((total, step, index) => {
      const subSteps = step.subSteps ?? [];
      if (!subSteps.length) return total + (currentStepIndex > index ? 1 : 0);
      return total + getCompletedSubSteps(activity, step, index, workflowSteps).length;
    }, 0);
    return Math.round(Math.min(1, completedUnits / totalUnits) * 100);
  };
  const getActivityProgress = (activity: Activity) => getActivityProgressForWorkflow(activity, activeSteps);
  const getDashboardActivityProgress = (activity: Activity) => {
    const workflow = programOptions.find((item) => item.id === activity.programId)?.steps ?? activeSteps;
    return getActivityProgressForWorkflow(activity, workflow);
  };
  const requestTimelineSubStepChange = (step: WorkflowStep, stepIndex: number, subStep: string) => {
    if (!canEdit || !selectedActivity) return;
    const completed = getCompletedSubSteps(selectedActivity, step, stepIndex);
    const shouldComplete = !completed.includes(subStep);
    if (shouldComplete) {
      const subStepIndex = (step.subSteps ?? []).indexOf(subStep);
      if (subStepIndex > 0 && !completed.includes(step.subSteps?.[subStepIndex - 1] ?? "")) {
        setNotice("Complete the previous sub-step first");
        return;
      }
    }
    setPendingTimelineStep({ stepTitle: step.title, subStep, shouldComplete });
  };
  const confirmTimelineStepChange = async () => {
    if (!pendingTimelineStep) return;
    const stepIndex = activeSteps.findIndex((step) => step.title === pendingTimelineStep.stepTitle);
    const step = activeSteps[stepIndex];
    if (!step || !selectedActivity) return;
    const completedSubSteps = Object.fromEntries(activeSteps.map((item, index) => [
      item.id,
      getCompletedSubSteps(selectedActivity, item, index),
    ]));
    const current = completedSubSteps[step.id] ?? [];
    completedSubSteps[step.id] = pendingTimelineStep.shouldComplete
      ? [...current, pendingTimelineStep.subStep]
      : current.filter((item) => item !== pendingTimelineStep.subStep);
    const lastCompletedStepIndex = activeSteps.reduce((last, item, index) =>
      (item.subSteps ?? []).length > 0 && completedSubSteps[item.id]?.length === item.subSteps?.length ? index : last, -1);
    const activeStepIndex = Math.min(lastCompletedStepIndex + 1, activeSteps.length - 1);
    const activeStep = activeSteps[activeStepIndex];
    const activeSubStep = completedSubSteps[activeStep?.id ?? ""]?.at(-1) ?? "";
    const currentStep = activeStep?.title ?? selectedActivity.currentStep;
    const status = getActivityStatus(steps, currentStep, activeSubStep);
    try {
      await updateDatabaseActivity(selectedActivity.id, {
        completed_sub_steps: completedSubSteps,
        current_step_id: activeStep?.id ?? null,
        current_sub_step: activeSubStep,
        status,
      });
      setActivities((currentActivities) => currentActivities.map((activity) => activity.id === selectedActivity.id
        ? { ...activity, completedSubSteps, currentStep, currentSubStep: activeSubStep, status }
        : activity));
      setPendingTimelineStep(null);
      setNotice("Workflow progress saved to the online database");
    } catch (error) {
      setNotice(`Workflow progress was not saved: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const navigateTo = (
    tab: "dashboard" | "details" | "workflow" | "activities" | "calendar" | "beneficiaries" | "settings" | "finance",
    message: string,
  ) => {
    setActiveTab(tab);
    if (tab === "finance" && program.id) void loadAnnualAllocations(program.id).then((rows) => {
      setAnnualAllocations(rows);
      setAllocationsByProgram((current) => ({ ...current, [program.id]: rows }));
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load annual allocations"));
    setNotice(message);
  };
  const openBeneficiaryForm = (record?: BeneficiaryRecord) => {
    setBeneficiaryEditingId(record?.id ?? null);
    setBeneficiaryForm({
      program_id: record?.program_id ?? (systemRole === "superadmin" && beneficiaryProgramFilter !== "all" ? beneficiaryProgramFilter : program.id),
      activity_ids: record?.activity_ids ?? [],
      beneficiary_name: record?.beneficiary_name ?? "",
      beneficiary_acronym: record?.beneficiary_acronym ?? "",
      fca_category: record?.fca_category ?? "",
      membership_count: record?.membership_count?.toString() ?? "",
      contact_person: record?.contact_person ?? "",
      contact_number: record?.contact_number ?? "",
      additional_details: record?.additional_details ?? "",
      province: record?.province ?? "",
      municipality: record?.municipality ?? "",
      barangay: record?.barangay ?? "",
      other_assistance_interventions: record?.other_assistance_interventions ?? "",
    });
    setBeneficiaryDialogOpen(true);
  };
  const saveBeneficiaryRecord = async () => {
    const name = beneficiaryForm.beneficiary_name.trim();
    const acronym = beneficiaryForm.beneficiary_acronym.trim();
    const otherAssistance = beneficiaryForm.other_assistance_interventions.trim();
    if (!beneficiaryForm.program_id) {
      setNotice("Select a program for this beneficiary record");
      return;
    }
    if (!name && !acronym) {
      setNotice("Enter an FCA name or acronym");
      return;
    }
    if (beneficiaryForm.membership_count && (!Number.isInteger(Number(beneficiaryForm.membership_count)) || Number(beneficiaryForm.membership_count) < 0)) {
      setNotice("Enter a whole-number FCA membership count of zero or more");
      return;
    }

    setBeneficiarySaving(true);
    try {
      const savedRecord = await saveBeneficiary({
        id: beneficiaryEditingId ?? undefined,
        program_id: beneficiaryForm.program_id,
        activity_ids: beneficiaryForm.activity_ids,
        beneficiary_name: name || null,
        beneficiary_acronym: acronym || null,
        fca_category: beneficiaryForm.fca_category.trim() || null,
        membership_count: beneficiaryForm.membership_count ? Number(beneficiaryForm.membership_count) : null,
        contact_person: beneficiaryForm.contact_person.trim() || null,
        contact_number: beneficiaryForm.contact_number.trim() || null,
        additional_details: beneficiaryForm.additional_details.trim() || null,
        province: beneficiaryForm.province.trim() || null,
        municipality: beneficiaryForm.municipality.trim() || null,
        barangay: beneficiaryForm.barangay.trim() || null,
        other_assistance_interventions: otherAssistance || null,
      });
      setBeneficiaryRecords((current) => beneficiaryEditingId
        ? current.map((record) => record.id === savedRecord.id ? savedRecord : record)
        : [savedRecord, ...current]);
      setBeneficiaryDialogOpen(false);
      setBeneficiaryEditingId(null);
      setNotice(beneficiaryEditingId ? "Beneficiary record updated" : "Beneficiary record added");
    } catch (error) {
      setNotice(`Beneficiary record could not be fully saved: ${getDatabaseErrorMessage(error)}`);
    } finally {
      setBeneficiarySaving(false);
    }
  };
  const deleteBeneficiaryRecord = async () => {
    if (!beneficiaryToDelete) return;
    setBeneficiaryDeleting(true);
    try {
      await deleteBeneficiary(beneficiaryToDelete.id);
      setBeneficiaryRecords((current) => current.filter((record) => record.id !== beneficiaryToDelete.id));
      setBeneficiaryToDelete(null);
      setNotice("Beneficiary record deleted");
    } catch (error) {
      setNotice(`Beneficiary record was not deleted: ${getDatabaseErrorMessage(error)}`);
    } finally {
      setBeneficiaryDeleting(false);
    }
  };
  if (!databaseConfigured) {
    return (
      <main className="database-setup-required">
        <section className="database-setup-card">
          <ShieldCheck size={32} />
          <p className="eyebrow">Online database required</p>
          <h1>Connect this app to Supabase</h1>
          <p>Local browser storage and demo records are disabled. Configure the hosted database before signing in or changing program data.</p>
          <ol>
            <li>Create or select the DA-RFO-CAR Supabase project.</li>
            <li>Set <code>VITE_SUPABASE_URL</code> and the public anon or publishable key in <code>.env.local</code>.</li>
            <li>Apply any missing migrations in filename order, including the annual APP, activity-calendar, and beneficiary-register migrations. On an existing database, run only migrations that have not already been applied.</li>
            <li>Restart the Vite server, then create the initial administrator in Supabase Auth and promote that profile as described in the README.</li>
          </ol>
          <p>For Vercel, set both Vite variables in the project's Environment Variables settings and redeploy the app.</p>
          <p className="database-setup-warning">Never place a Supabase service-role key or real user password in client code or committed files.</p>
        </section>
      </main>
    );
  }
  if (authReady && !session) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={handleLogin}>
          <p className="eyebrow">DA-RFO-CAR</p>
          <h1>Welcome back</h1>
          <p>Sign in to manage programs, activities, workflows, procurement, and annual financial records.</p>
          <label>Email<input type="email" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
          <label>Password<input type="password" minLength={8} required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
          {loginError && <div className="auth-error">{loginError}</div>}
          <button className="button primary" type="submit">Sign in</button>
        </form>
      </main>
    );
  }
  return (
    <div
      className="app-shell"
      style={
        {
          "--program-primary": program.primary,
          "--program-accent": program.accent,
        } as React.CSSProperties
      }
    >
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <strong className="current-program-label">{systemRole === "superadmin" ? "DA-RFO-CAR Tracking System" : `${program.acronym} · ${program.title}`}</strong>
          </div>
          <div className="top-actions">
            <nav className="top-nav" aria-label="Program builder views">
              <button
                className={
                  activeTab === "dashboard"
                    ? "top-nav-item active"
                    : "top-nav-item"
                }
                onClick={() => navigateTo("dashboard", "Dashboard opened")}
              >
                <LayoutDashboard size={14} /> Dashboard
              </button>
              <button className={activeTab === "finance" ? "top-nav-item active" : "top-nav-item"} onClick={() => navigateTo("finance", "Financial management opened")}>
                <CircleDollarSign size={14} /> Finance
              </button>
              <button
                className={
                  activeTab === "activities"
                    ? "top-nav-item active"
                    : "top-nav-item"
                }
                onClick={() => navigateTo("activities", "Activities opened")}
              >
                <Table2 size={14} /> Activities
              </button>
              <button
                className={activeTab === "beneficiaries" ? "top-nav-item active" : "top-nav-item"}
                onClick={() => navigateTo("beneficiaries", "Beneficiary register opened")}
              >
                <Users size={14} /> Beneficiaries
              </button>
              <button
                className={activeTab === "calendar" ? "top-nav-item active" : "top-nav-item"}
                onClick={() => navigateTo("calendar", "Activity calendar opened")}
              >
                <CalendarDays size={14} /> Calendar
              </button>
              <button
                className={
                  activeTab === "settings"
                    ? "top-nav-item active"
                    : "top-nav-item"
                }
                onClick={() => navigateTo("settings", "Settings opened")}
              >
                <Settings size={14} /> Settings
              </button>
            </nav>
            {systemRole !== "superadmin" && <button
              className="icon-button"
              aria-label="Search"
              onClick={() =>
                navigateTo(
                  "activities",
                  "Search opened in the activity register",
                )
              }
            >
              <Search size={18} />
            </button>}
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setNotice("No new workflow notifications")}
            >
              <Bell size={18} />
              <i />
            </button>
            <button
              className="header-avatar"
              onClick={() => setNotice(profile?.email ?? "Profile opened")}
              aria-label="Open profile"
            >
              {(profile?.full_name ?? "MA").slice(0, 2).toUpperCase()}
            </button>
            {session && <button className="button secondary" onClick={() => void signOut()}>Sign out</button>}
          </div>
        </header>
        <div className={`content-wrap ${activeTab === "finance" ? "content-wrap-finance" : ""} ${activeTab === "calendar" ? "content-wrap-calendar" : ""}`}>
          <section className="page-heading">
            <div>
              <p className="eyebrow">
                {activeTab === "dashboard" ? (systemRole === "superadmin" ? "System dashboard" : "Program dashboard") : activeTab === "calendar" ? "Activity calendar" : activeTab === "beneficiaries" ? "Beneficiary register" : activeTab === "finance" ? "Financial management" : activeTab === "settings" && (settingsSection === "database" || settingsSection === "programs") ? "Superadmin tools" : `${program.acronym} workspace`}
              </p>
              <div className="page-heading-title-row">
                {activeTab === "dashboard" && systemRole === "superadmin" && <label className="superadmin-program-view">
                  <span>Program view</span>
                  <select value={dashboardProgramFilter} onChange={(event) => {
                    const value = event.target.value;
                    setDashboardProgramFilter(value);
                    if (value === "all") {
                      setActiveTab("dashboard");
                      setNotice("All programs overview");
                    } else {
                      selectProgram(value);
                    }
                  }} aria-label="Choose program dashboard view">
                    <option value="all">All programs</option>
                    {programOptions.map((item) => <option key={item.id} value={item.id}>{item.acronym} — {item.title}</option>)}
                  </select>
                </label>}
                <h1>{activeTab === "dashboard" ? (systemRole === "superadmin" ? "System dashboard" : "Program dashboard") : activeTab === "details" ? "Program details" : activeTab === "activities" ? "Activity register" : activeTab === "calendar" ? "Activity calendar" : activeTab === "beneficiaries" ? "Beneficiary register" : activeTab === "finance" ? "Annual allocations & utilization" : "Settings"}</h1>
              </div>
              <p className="page-intro">
                {activeTab === "dashboard" ? (systemRole === "superadmin" ? "Monitor all programs, activities, budgets, and user access." : "Monitor activity totals, utilization, and overdue work.") : activeTab === "calendar" ? "Color-coded schedules can be edited here, and each day can have a shared note." : activeTab === "beneficiaries" ? "Record beneficiary identifiers, location, assistance received, and the activity supported." : activeTab === "finance" ? "Track appropriations, allotments, obligations, disbursements, accounts payable, cash advances, liquidation, and savings by fiscal year." : activeTab === "settings" && settingsSection === "programs" ? "Create programs and manage program details from the Superadmin workspace." : activeTab === "settings" && settingsSection === "database" ? "Browse database records in the read-only Superadmin database viewer." : "Manage the program's operational sequence and fund-tracking rules."}
              </p>
            </div>
            <div className="heading-actions">
              <span className="draft-pill">
                <span /> {notice || "Unsaved changes"}
              </span>
              {isAdmin && program.id && activeTab !== "finance" && activeTab !== "calendar" && activeTab !== "beneficiaries" && !(activeTab === "settings" && settingsSection === "database") && <button className="button primary" onClick={() => void saveProgramChanges()}>
                <Save size={16} /> {saved ? "Saved" : "Save program"}
              </button>}
            </div>
          </section>
          {activeTab === "dashboard" ? (
            <div className="dashboard-grid">
              <section className="dashboard-panel dashboard-program-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">{systemRole === "superadmin" && dashboardProgramFilter === "all" ? "System portfolio" : "Program profile"}</p><h2>{systemRole === "superadmin" && dashboardProgramFilter === "all" ? "All programs" : program.title}</h2></div><span className="dashboard-muted">{dashboardProgramCount} program{dashboardProgramCount === 1 ? "" : "s"}</span></div>{systemRole === "superadmin" && dashboardProgramFilter === "all" ? <div className="superadmin-program-list">{programOptions.map((item) => <button className="superadmin-program-row" key={item.id} onClick={() => openProgramWorkspace(item.id)} aria-label={`Open ${item.acronym} finance and program workspace`}><span className="program-summary-copy">{item.logo ? <img src={item.logo} alt="" /> : <ShieldCheck size={28} />}<span><strong>{item.acronym}</strong><small>{item.title}</small></span></span><span><b>{(activitiesByProgram[item.id] ?? []).length}</b><small>activities</small></span><span className="program-row-open-label">Open workspace</span><ChevronDown size={17} /></button>)}</div> : <div className="program-summary"><div className="program-summary-copy">{program.logo ? <img src={program.logo} alt="" /> : <ShieldCheck size={28} />}<div><strong>{program.acronym}</strong><span>{program.agency}</span><span>{program.office}</span></div></div><div><small>Beneficiaries</small><strong>{program.beneficiaries}</strong></div><p>{program.description}</p></div>}</section>
              <div className="dashboard-filter-bar">
                <label>Fiscal year
                  <select value={dashboardFiscalYear} onChange={(event) => setDashboardFiscalYear(Number(event.target.value))}>
                    {dashboardYearOptions.map((year) => <option key={year} value={year}>FY {year}</option>)}
                  </select>
                </label>
                <label>Activity status
                  <select value={dashboardStatusFilter} onChange={(event) => setDashboardStatusFilter(event.target.value)}>
                    <option value="all">All statuses</option>
                    {Array.from(new Set(allDashboardActivities.map((activity) => activity.status))).sort().map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <span className="dashboard-filter-scope">Showing {dashboardScopeLabel}</span>
              </div>
              <section className="dashboard-metric-section dashboard-financial-metrics">
                <div className="dashboard-metric-heading"><div><p className="eyebrow">Financial overview · FY {dashboardYear}</p><h2>Budget and expenditure</h2></div><div className="dashboard-finance-heading-actions"><span className="dashboard-muted">{dashboardYearAllocations.length} allocation record{dashboardYearAllocations.length === 1 ? "" : "s"} · {dashboardScopeLabel}</span><div className="dashboard-card-settings"><button type="button" className="icon-button" aria-label="Financial card settings" aria-expanded={showDashboardCardSettings} onClick={() => setShowDashboardCardSettings((visible) => !visible)}><Settings size={16} /></button>{showDashboardCardSettings && <div className="dashboard-card-settings-menu" aria-label="Choose financial cards"><strong>Show financial cards</strong>{dashboardFinancialCardOptions.map((card) => <label key={card.id}><input type="checkbox" checked={dashboardFinancialColumns.includes(card.id)} onChange={(event) => setDashboardFinancialColumns((current) => event.target.checked ? [...current, card.id] : current.filter((item) => item !== card.id))} /><span>{card.label}</span></label>)}</div>}</div></div></div>
                <div className="dashboard-metric-grid">
                  {dashboardFinancialCardOptions.filter((card) => dashboardFinancialColumns.includes(card.id)).map((card) => <button type="button" key={card.id} className={`dashboard-card dashboard-card-button ${card.id === "appropriation" ? "dashboard-financial-highlight" : ""}`} onClick={() => setDashboardChartMetric(card.metric)}><span className="dashboard-label">{card.label}</span><strong>{formatDashboardCurrency(card.value)}</strong><small>{card.detail} · View chart</small></button>)}
                </div>
                <div className="dashboard-visualizations">
                  <div className="chart-block">
                    <div className="chart-heading"><strong>Budget execution</strong><span>Allocation measures · FY {dashboardYear}</span></div>
                    {[
                      { label: "Appropriation", value: dashboardFinancialTotals.appropriation, color: "chart-appropriation" },
                      { label: "Allotment", value: dashboardFinancialTotals.allotment, color: "chart-allotment" },
                      { label: "Obligations", value: dashboardObligations, color: "chart-obligations" },
                      { label: "APP planned procurement", value: dashboardAppBudget, color: "chart-disbursements" },
                      { label: "Disbursements", value: dashboardFinancialTotals.disbursements, color: "chart-disbursements" },
                    ].map((metric) => <div className="dashboard-chart-value-row" key={metric.label}><span>{metric.label}</span><div className="dashboard-chart-value-track"><i className={metric.color} style={{ width: `${dashboardFinancialTotals.appropriation ? Math.min(100, metric.value / dashboardFinancialTotals.appropriation * 100) : 0}%` }} /></div><b>{formatDashboardCurrency(metric.value)}</b></div>)}
                  </div>
                  <div className="chart-block">
                    <div className="chart-heading"><strong>Obligations vs activity budget</strong><span>{dashboardYearActivityBudget ? Math.round(dashboardObligations / dashboardYearActivityBudget * 100) : 0}% obligated</span></div>
                    <div className="budget-gauge"><div className="budget-gauge-fill" style={{ width: `${dashboardYearActivityBudget ? Math.min(100, dashboardObligations / dashboardYearActivityBudget * 100) : 0}%` }} /></div>
                    <div className="budget-legend"><span><i className="legend-spent" /> Obligations <b>{formatDashboardCurrency(dashboardObligations)}</b></span><span><i className="legend-remaining" /> Remaining activity budget <b>{formatDashboardCurrency(Math.max(0, dashboardYearActivityBudget - dashboardObligations))}</b></span></div>
                  </div>
                </div>
              </section>
              <section className="dashboard-metric-section dashboard-activity-metrics">
                <div className="dashboard-metric-heading"><div><p className="eyebrow">Operational overview</p><h2>Activity overview</h2></div><span className="dashboard-muted">{dashboardActivities.length} matching activities · {dashboardScopeLabel}</span></div>
                <div className="dashboard-metric-grid">
                  <button type="button" className="dashboard-card dashboard-total dashboard-card-button" onClick={() => setDashboardChartMetric("totalActivities")}><span className="dashboard-label">Total activities</span><strong>{dashboardTotals.activities}</strong><small>All registered activities · View chart</small></button>
                  <button type="button" className="dashboard-card dashboard-card-button" onClick={() => setDashboardChartMetric("completedActivities")}><span className="dashboard-label">Completed activities</span><strong>{dashboardTotals.completed}</strong><small>{dashboardTotals.activities ? Math.round(dashboardTotals.completed / dashboardTotals.activities * 100) : 0}% of total · View chart</small></button>
                  <button type="button" className="dashboard-card dashboard-card-button" onClick={() => setDashboardChartMetric("notCompletedActivities")}><span className="dashboard-label">Not completed</span><strong>{dashboardTotals.activities - dashboardTotals.completed}</strong><small>Still in the workflow · View chart</small></button>
                  <button type="button" className="dashboard-card dashboard-overdue dashboard-card-button" onClick={() => setDashboardChartMetric("overdueActivities")}><span className="dashboard-label">Overdue activities</span><strong>{dashboardTotals.overdue}</strong><small>Past target end date · View chart</small></button>
                </div>
              </section>
              <section className="dashboard-panel dashboard-analytics-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Operational analytics</p><h2>Activity status distribution</h2></div><span className="dashboard-muted">{dashboardTotals.activities} activities · {dashboardScopeLabel}</span></div><div className="chart-block"><div className="chart-heading"><strong>Activities by status</strong><span>Click a status to view activities</span></div><div className="status-bars">{dashboardStatusSummary.map((status) => <button type="button" className="status-bar-row dashboard-status-button" key={status.label} title={`View ${status.count} ${status.label} activities`} onClick={() => setDashboardStatusDialog(status.label)}><span>{status.label}</span><div className="status-bar-track"><i className={status.className} style={{ width: `${dashboardTotals.activities ? (status.count / dashboardTotals.activities) * 100 : 0}%` }} /></div><b>{status.count}</b></button>)}</div></div></section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Needs attention</p><h2>Overdue activities</h2></div><button className="button secondary" onClick={() => navigateTo("activities", "Overdue activities opened")}>View activities</button></div>{dashboardActivities.filter((activity) => activity.endDate < today && activity.status !== "Completed").length ? <div className="overdue-list">{dashboardActivities.filter((activity) => activity.endDate < today && activity.status !== "Completed").map((activity) => <button className="overdue-row" key={activity.id} onClick={() => openDashboardActivity(activity)}><span className="overdue-dot" /><span><strong>{activity.name}</strong><small>{activity.location} · Due {activity.endDate}</small></span><span className="status-tag status-revision">{activity.status}</span></button>)}</div> : <div className="empty-state"><Check size={20} /> No overdue activities</div>}</section>
              <section className="dashboard-panel dashboard-progress-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">{systemRole === "superadmin" ? "Portfolio activity" : "Program activity"}</p><h2>Activity progress</h2></div><div className="dashboard-progress-heading-actions"><span className="dashboard-muted">{dashboardActivities.length} activities</span><div className="dashboard-card-settings"><button type="button" className="icon-button" aria-label="Activity progress settings" aria-expanded={showDashboardProgressSettings} onClick={() => setShowDashboardProgressSettings((visible) => !visible)}><Settings size={16} /></button>{showDashboardProgressSettings && <div className="dashboard-card-settings-menu dashboard-progress-settings-menu"><strong>View as</strong><label><input type="radio" name="dashboard-progress-view" checked={dashboardProgressView === "graph"} onChange={() => { setDashboardProgressView("graph"); setShowDashboardProgressSettings(false); }} /><span>Graph view</span></label><label><input type="radio" name="dashboard-progress-view" checked={dashboardProgressView === "list"} onChange={() => { setDashboardProgressView("list"); setShowDashboardProgressSettings(false); }} /><span>List view</span></label></div>}</div></div></div><div className="dashboard-progress-card-content">{dashboardProgressView === "graph" ? <div className="workflow-completion-chart">{dashboardActivities.length ? dashboardActivities.slice(0, 12).map((activity) => { const progress = getDashboardActivityProgress(activity); return <button type="button" className="workflow-completion-item dashboard-progress-activity-button" key={activity.id} title={`${activity.name}: ${progress}% — open activity`} aria-label={`Open ${activity.name}, ${progress}% complete`} onClick={() => openDashboardActivity(activity)}><span style={{ height: `${progress}%` }} /><small>{activity.name}</small><b>{progress}%</b></button>; }) : <div className="empty-state">No activities match these filters.</div>}</div> : <div className="dashboard-progress-list">{dashboardActivities.slice(0, 12).map((activity) => { const progress = getDashboardActivityProgress(activity); const workflow = programOptions.find((item) => item.id === activity.programId)?.steps ?? steps; return <button type="button" className="dashboard-progress-row dashboard-progress-activity-button" key={activity.id} onClick={() => openDashboardActivity(activity)}><span><strong>{activity.name}</strong><small>{getNumberedStep(workflow, activity.currentStep)}</small></span><span className="dashboard-progress-bar"><span style={{ width: `${progress}%` }} /></span><b>{progress}%</b></button>; })}{!dashboardActivities.length && <div className="empty-state">No activities match these filters.</div>}</div>}</div></section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Completed work</p><h2>Finished activities</h2></div><span className="dashboard-muted">{dashboardActivities.filter((activity) => activity.status === "Completed").length} finished</span></div>{dashboardActivities.filter((activity) => activity.status === "Completed").length ? <div className="finished-list">{dashboardActivities.filter((activity) => activity.status === "Completed").map((activity) => <button className="finished-row" key={activity.id} onClick={() => openDashboardActivity(activity)}><span className="finished-check"><Check size={13} /></span><span><strong>{activity.name}</strong><small>{activity.location} · Finished {activity.endDate}</small></span><span className="status-tag status-completed">Completed</span></button>)}</div> : <div className="empty-state"><Check size={20} /> No finished activities</div>}</section>
            </div>
          ) : activeTab === "finance" ? (
            <section className="finance-page">
              <div className="finance-toolbar">
                <div><p className="eyebrow">{program.acronym} · Annual financial records{systemRole === "superadmin" ? " · Superadmin read-only view" : ""}</p><h2>{financeSheet === "APP" ? "Annual Procurement Plan (APP)" : financeSheet === "WFP" ? "Work and Financial Plan (WFP)" : "Project Procurement Management Plan (PPMP)"}</h2><p>View {financeSheet} sheets by fiscal year. Financial editing is restricted to this program's administrator.</p></div>
                <div className="finance-toolbar-actions">
                  {systemRole === "superadmin" && <label className="fiscal-year-select finance-program-select">Program<select aria-label="Select a program to view its financial records" value={program.id} onChange={(event) => { if (event.target.value !== program.id) selectProgram(event.target.value); }}><option value="" disabled>Select a program</option>{programOptions.map((item) => <option key={item.id} value={item.id}>{item.acronym} — {item.title}</option>)}</select></label>}
                  <label className="fiscal-year-select">Fiscal year<select value={selectedFiscalYear} onChange={(event) => setSelectedFiscalYear(Number(event.target.value))}>{Array.from(new Set([...annualAllocations.map((row) => row.fiscal_year), ...procurementPlanYears, selectedFiscalYear, currentFiscalYear - 1, currentFiscalYear, currentFiscalYear + 1])).sort((a, b) => b - a).map((year) => <option key={year} value={year}>FY {year}</option>)}</select></label>
                  <button type="button" className="button secondary" onClick={() => setShowAllocationEditor(true)}><Settings size={15} /> {canManageFinance ? "Edit annual financial details" : "View annual financial details"}</button>
                </div>
              </div>
              {(() => {
                const allocationRows = annualAllocations.filter((row) => row.fiscal_year === selectedFiscalYear);
                const annualActivityObligations = activities
                  .filter((activity) => getActivityYear(activity) === selectedFiscalYear)
                  .reduce((total, activity) => total + activity.spent, 0);
                const totals = allocationRows.reduce((total, row) => ({
                  appropriation: total.appropriation + Number(row.appropriation),
                  allotment: total.allotment + Number(row.allotment_received),
                  disbursements: total.disbursements + Number(row.disbursements),
                }), { appropriation: 0, allotment: 0, disbursements: 0 });
                const peso = (amount: number) => `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const visibleAppPlanColumnWidths = appPlanColumnWidths.slice(0, canManageFinance ? 13 : 12);
                const appPlanColumnWidthTotal = visibleAppPlanColumnWidths.reduce((total, width) => total + width, 0);
                const renderAppPlanRow = (row: ProcurementPlanItem | null) => {
                  const key = procurementPlanRowKey(row);
                  const draft = procurementPlanDrafts[key] ?? (row ? appPlanItemToDraft(row) : createEmptyAppPlanRowDraft());
                  const saving = procurementPlanSavingId === key;
                  const cell = (field: keyof AppPlanRowDraft, label: string, rawValue: string, displayValue = rawValue || "—") => <td title={`${label}: ${displayValue}`}>
                    <button type="button" className="finance-cell-trigger" disabled={saving} aria-label={`View ${label}: ${displayValue}`} onClick={() => setFinanceCellEditor({ row, field, label })}>{displayValue}</button>
                  </td>;
                  const startMonth = draft.procurement_start;
                  const endMonth = draft.procurement_end;
                  return <tr key={key}>
                    {cell("project_title", "Project title", draft.project_title)}
                    {cell("implementing_unit", "End-user or implementing unit", draft.implementing_unit)}
                    {cell("project_description", "General project description", draft.project_description)}
                    {cell("procurement_mode", "Mode of procurement", draft.procurement_mode)}
                    {cell("early_procurement_activity", "Early procurement activity", draft.early_procurement_activity ? "true" : "false", draft.early_procurement_activity ? "Yes" : "No")}
                    {cell("bid_evaluation_criteria", "Bid evaluation criteria", draft.bid_evaluation_criteria)}
                    {cell("procurement_start", "Start of procurement activity", startMonth, startMonth ? `${startMonth.slice(5, 7)}/${startMonth.slice(0, 4)}` : "—")}
                    {cell("procurement_end", "End of procurement activity", endMonth, endMonth ? `${endMonth.slice(5, 7)}/${endMonth.slice(0, 4)}` : "—")}
                    {cell("source_of_fund", "Source of fund", draft.source_of_fund)}
                    {cell("estimated_budget", "Estimated budget / approved contract budget", draft.estimated_budget, peso(Number(draft.estimated_budget) || 0))}
                    {cell("procurement_strategy", "Procurement strategy or tools", draft.procurement_strategy)}
                    {cell("remarks", "Remarks", draft.remarks)}
                    {canManageFinance && <td><div className="finance-row-actions"><button type="button" className="button primary spreadsheet-save" disabled={saving || !procurementPlanDrafts[key]} onClick={() => void saveProcurementPlanRow(row)}><Save size={13} /> {saving ? "Saving" : "Save"}</button>{procurementPlanDrafts[key] && <button type="button" className="button secondary spreadsheet-save" disabled={saving} onClick={() => setProcurementPlanDrafts((current) => { const next = { ...current }; delete next[key]; return next; })}>Cancel</button>}{row && <button type="button" className="icon-button danger" aria-label={`Delete APP project ${row.project_title}`} onClick={() => void deleteProcurementPlanRow(row)}><Trash2 size={15} /></button>}</div></td>}
                  </tr>;
                };
                return <>
                  <div className="finance-summary-grid">
                    <article><small>Allocated budget / appropriation</small><strong>{peso(totals.appropriation)}</strong><span>Annual budget authority</span></article>
                    <article><small>Allotment received</small><strong>{peso(totals.allotment)}</strong><span>Annual allotment authority</span></article>
                    <article><small>Obligations</small><strong>{peso(annualActivityObligations)}</strong><span>Automatically totaled from activity records</span></article>
                    <article><small>Disbursements</small><strong>{peso(totals.disbursements)}</strong><span>Recorded financial disbursements</span></article>
                  </div>
                  <nav className="finance-sheet-tabs" aria-label="Annual financial worksheets">{(["APP", "WFP", "PPMP"] as ProcurementPlanType[]).map((sheet) => <button key={sheet} type="button" className={financeSheet === sheet ? "finance-sheet-tab active" : "finance-sheet-tab"} aria-current={financeSheet === sheet ? "page" : undefined} onClick={() => setFinanceSheet(sheet)}>{sheet}</button>)}</nav>
                  {financeSheet === "APP" ? <>
                    <section className="finance-card app-plan-header">
                      <div><p className="eyebrow">{program.acronym} · FY {selectedFiscalYear}</p><h3>Annual Procurement Plan{procurementPlanHeader.is_continuing ? " — Continuing" : ""}</h3><p className="app-sheet-save-status">{procurementPlanSheet ? `${procurementPlanSheet.plan_status} APP saved` : "New APP sheet"}</p></div>
                      <div className="app-plan-header-controls">
                        <label className="app-continuing-control"><input type="checkbox" checked={procurementPlanHeader.is_continuing} disabled={!canManageFinance} onChange={(event) => setProcurementPlanHeader((current) => ({ ...current, is_continuing: event.target.checked }))} /> Continuing</label>
                        <label>Plan status<select value={procurementPlanHeader.plan_status} disabled={!canManageFinance} onChange={(event) => setProcurementPlanHeader((current) => ({ ...current, plan_status: event.target.value as "Indicative" | "Final" }))}><option>Indicative</option><option>Final</option></select></label>
                        <label>Updated, version no.<input value={procurementPlanHeader.version_no} disabled={!canManageFinance} onChange={(event) => setProcurementPlanHeader((current) => ({ ...current, version_no: event.target.value }))} /></label>
                        {canManageFinance && <button type="button" className="button secondary" onClick={() => void saveProcurementPlanHeader()}><Save size={14} /> Save APP details</button>}
                      </div>
                    </section>
                    <section className="finance-card app-plan-card">
                      <div className="section-title app-plan-section-heading"><div><h3>APP project details</h3><p>{procurementPlanItems.length} procurement project{procurementPlanItems.length === 1 ? "" : "s"} · enter dates as month and year. Saving a project also creates or updates its Activity and Calendar entry.</p></div><div className="app-plan-transfer-actions"><button type="button" className="button secondary" onClick={exportAppPlanCsv} disabled={!procurementPlanItems.length}><Download size={14} /> Export CSV</button>{canManageFinance && <><button type="button" className="button secondary" onClick={() => appPlanImportInputRef.current?.click()} disabled={procurementPlanImporting}><Upload size={14} /> {procurementPlanImporting ? "Importing…" : "Import CSV"}</button><input ref={appPlanImportInputRef} className="visually-hidden" type="file" accept=".csv,text/csv" aria-label="Import APP projects from CSV" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void importAppPlanCsv(file); event.currentTarget.value = ""; }} /></>}</div></div>
                      {procurementPlanLoading ? <div className="empty-state">Loading FY {selectedFiscalYear} APP…</div> : procurementPlanItems.length || canManageFinance ? <div className="finance-table-wrap app-plan-table-wrap"><table className="finance-table app-plan-table"><colgroup>{visibleAppPlanColumnWidths.map((width, index) => <col key={index} style={{ width: `${width / appPlanColumnWidthTotal * 100}%` }} />)}</colgroup><thead><tr><th className="app-plan-group-header" colSpan={6} title="Procurement project details">Project details</th><th className="app-plan-group-header app-plan-timeline-header" colSpan={2} title="Projected timeline (month and year)">Timeline (MM/YYYY)</th><th className="app-plan-group-header app-plan-funding-header" colSpan={2} title="Funding details">Funding</th><th className="app-plan-group-header app-plan-strategy-header" rowSpan={2}>{appPlanResizeHandle(10)}<span title="Procurement strategy or tools">Strategy / tools</span></th><th className="app-plan-group-header app-plan-remarks-header" rowSpan={2}>{appPlanResizeHandle(11)}<span title="Remarks and other relevant descriptions of the procurement project, if applicable">Remarks</span></th>{canManageFinance && <th className="app-plan-group-header app-plan-actions-header" rowSpan={2}>{appPlanResizeHandle(12)}Actions</th>}</tr><tr>{["Project title", "End-user or implementing unit", "General description of the project", "Mode of procurement", "Early procurement activity? (Yes/No)", "Criteria for bid evaluation (including sustainability and domestic preference)", "Start of procurement activity", "End of procurement activity", "Source of fund", "Estimated budget / approved budget for the contract (PhP)"].map((heading, index) => {
                        const shortHeadings = ["Project title", "End user / unit", "Project description", "Procurement mode", "Early procurement?", "Evaluation criteria", "Start", "End", "Fund source", "Est. budget (PHP)"];
                        return <th className="app-plan-column-header" key={heading} title={heading} aria-label={heading}>{appPlanResizeHandle(index)}<span>{shortHeadings[index]}</span></th>;
                      })}</tr></thead><tbody>{procurementPlanItems.map((row) => renderAppPlanRow(row))}{canManageFinance && renderAppPlanRow(null)}</tbody><tfoot><tr><th colSpan={9}>APP estimated budget total</th><td>{peso(procurementPlanItems.reduce((sum, row) => sum + Number(row.estimated_budget), 0))}</td><td colSpan={canManageFinance ? 3 : 2}></td></tr></tfoot></table></div> : <div className="empty-state">No APP projects have been entered for FY {selectedFiscalYear}.</div>}
                    </section>
                  </> : <section className="finance-card finance-sheet-placeholder"><p className="eyebrow">FY {selectedFiscalYear} · {financeSheet}</p><h3>{financeSheet === "WFP" ? "Work and Financial Plan" : "Project Procurement Management Plan"}</h3><p>This separate fiscal-year worksheet is reserved for {financeSheet}. Its table will be added when you provide that template.</p></section>}
                </>;
              })()}
              {showAllocationEditor && <div className="dialog-overlay finance-editor-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowAllocationEditor(false); }}>
                <dialog open className="activity-dialog finance-allocation-editor" aria-labelledby="annual-finance-editor-title">
                  <section className="finance-card">
                    <div className="section-title"><div><p className="eyebrow">FY {selectedFiscalYear} · {canManageFinance ? "Program admin" : "Read only"}</p><h3 id="annual-finance-editor-title">{canManageFinance ? "Edit annual financial details" : "Annual financial details"}</h3><p>Obligations and other calculated totals are excluded from this form.</p></div><button type="button" className="icon-button" aria-label="Close annual financial editor" onClick={() => setShowAllocationEditor(false)}><X size={17} /></button></div>
                    {(() => {
                      const rows = annualAllocations.filter((row) => row.fiscal_year === selectedFiscalYear);
                      const newRowKey = allocationRowDraftKey(null);
                      const renderAllocationForm = (row: AnnualProgramAllocation | null) => {
                        const key = allocationRowDraftKey(row);
                        const draft = allocationRowDrafts[key] ?? (row ? allocationToDraft(row) : createEmptyAllocationDraft());
                        const saving = allocationRowSavingId === key;
                        const moneyField = (field: keyof AllocationDraft, label: string) => <label className="allocation-form-field"><span>{label}</span><input type="number" min="0" step="0.01" value={draft[field]} disabled={!canManageFinance || saving} onChange={(event) => updateAllocationRowDraft(row, field, event.target.value)} /></label>;
                        const referenceField = (field: keyof AllocationDraft, label: string) => <label className="allocation-form-field"><span>{label}</span><input value={draft[field]} placeholder="Optional reference" disabled={!canManageFinance || saving} onChange={(event) => updateAllocationRowDraft(row, field, event.target.value)} /></label>;
                        return <form className="annual-allocation-form" key={key} onSubmit={(event) => { event.preventDefault(); void saveAllocationRow(row); }}>
                          <div className="annual-allocation-form-heading"><strong>{draft.fund_source || "New fund source"}</strong>{row && <span>FY {row.fiscal_year}</span>}</div>
                          <div className="allocation-form-grid">
                            <label className="allocation-form-field"><span>Fund source</span><input value={draft.fund_source} disabled={!canManageFinance || saving} onChange={(event) => updateAllocationRowDraft(row, "fund_source", event.target.value)} /></label>
                            {moneyField("appropriation", "Appropriation")}
                            {moneyField("allotment_received", "Allotment received")}
                            {referenceField("allotment_reference", "SARO / NCA reference")}
                            {moneyField("disbursements", "Disbursements")}
                            {referenceField("disbursement_reference", "DV / ADA reference")}
                            {moneyField("accounts_payable", "Accounts payable")}
                            {moneyField("cash_advances", "Cash advances")}
                            {moneyField("liquidation", "Liquidation")}
                            {moneyField("savings", "Savings")}
                            <label className="allocation-form-field allocation-form-wide"><span>Remarks</span><textarea rows={2} value={draft.remarks} disabled={!canManageFinance || saving} onChange={(event) => updateAllocationRowDraft(row, "remarks", event.target.value)} /></label>
                          </div>
                          {canManageFinance && <div className="allocation-form-actions">
                            {allocationRowDrafts[key] && <button type="button" className="button secondary" disabled={saving} onClick={() => setAllocationRowDrafts((current) => { const next = { ...current }; delete next[key]; return next; })}>Cancel changes</button>}
                            <button type="submit" className="button primary" disabled={saving || !allocationRowDrafts[key]}><Save size={14} /> {saving ? "Saving…" : "Save details"}</button>
                            {row && <button type="button" className="button danger-outline" disabled={saving} onClick={() => void removeAllocation(row.id)}><Trash2 size={14} /> Delete</button>}
                          </div>}
                        </form>;
                      };
                      return <div className="annual-allocation-editor">
                        {!rows.length && !canManageFinance && <div className="empty-state">No annual financial details for FY {selectedFiscalYear}.</div>}
                        <div className="annual-allocation-grid">{rows.map((row) => renderAllocationForm(row))}{canManageFinance && allocationRowDrafts[newRowKey] && renderAllocationForm(null)}</div>
                        {canManageFinance && <button type="button" className="button secondary add-allocation-button" disabled={Boolean(allocationRowDrafts[newRowKey])} onClick={() => setAllocationRowDrafts((current) => ({ ...current, [newRowKey]: createEmptyAllocationDraft() }))}><Plus size={14} /> Add fund source</button>}
                      </div>;
                    })()}
                  </section>
                </dialog>
              </div>}
              {financeCellEditor && (() => {
                const { row, field, label } = financeCellEditor;
                const key = procurementPlanRowKey(row);
                const draft = procurementPlanDrafts[key] ?? (row ? appPlanItemToDraft(row) : createEmptyAppPlanRowDraft());
                const rawValue = draft[field];
                const rawText = typeof rawValue === "string" ? rawValue : "";
                const value = typeof rawValue === "boolean" ? rawValue ? "Yes" : "No" : rawText;
                const displayValue = field === "estimated_budget"
                  ? formatDashboardCurrency(Number(rawText) || 0)
                  : field === "procurement_start" || field === "procurement_end"
                    ? rawText ? `${rawText.slice(5, 7)}/${rawText.slice(0, 4)}` : "—"
                    : value || "—";
                const isLongText = field === "project_description" || field === "bid_evaluation_criteria" || field === "procurement_strategy" || field === "remarks";
                const saving = procurementPlanSavingId === key;
                return <div className="dialog-overlay finance-editor-overlay" onClick={(event) => { if (event.target === event.currentTarget) setFinanceCellEditor(null); }}>
                  <dialog open className="activity-dialog finance-cell-dialog" aria-labelledby="finance-cell-dialog-title">
                    <div className="detail-heading">
                      <div><p className="eyebrow">FY {selectedFiscalYear} · {row?.project_title || "New APP project"}</p><h2 id="finance-cell-dialog-title">{label}</h2><p className="detail-subtitle">{canManageFinance ? "View and edit this cell. Save applies all pending changes for this row." : "Read-only financial record"}</p></div>
                      <button type="button" className="icon-button" aria-label="Close cell details" onClick={() => setFinanceCellEditor(null)}><X size={17} /></button>
                    </div>
                    {canManageFinance
                      ? field === "early_procurement_activity"
                        ? <label className="finance-cell-field">Value<select value={rawValue === true ? "yes" : "no"} disabled={saving} onChange={(event) => updateProcurementPlanDraft(row, field, event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></select></label>
                        : field === "procurement_start" || field === "procurement_end"
                          ? <label className="finance-cell-field">{label}<input type="month" value={rawText} disabled={saving} onChange={(event) => updateProcurementPlanDraft(row, field, event.target.value)} /></label>
                          : field === "estimated_budget"
                            ? <label className="finance-cell-field">{label}<input type="number" min="0" step="0.01" value={rawText} disabled={saving} onChange={(event) => updateProcurementPlanDraft(row, field, event.target.value)} /></label>
                            : <label className="finance-cell-field">{label}{isLongText
                              ? <textarea rows={7} value={rawText} disabled={saving} onChange={(event) => updateProcurementPlanDraft(row, field, event.target.value)} />
                              : <input value={rawText} disabled={saving} onChange={(event) => updateProcurementPlanDraft(row, field, event.target.value)} />}</label>
                      : <div className="finance-cell-value">{displayValue}</div>}
                    {canManageFinance && <div className="finance-cell-actions">
                      <button type="button" className="button secondary" disabled={saving} onClick={() => { setProcurementPlanDrafts((current) => { const next = { ...current }; delete next[key]; return next; }); setFinanceCellEditor(null); }}>Cancel changes</button>
                      <button type="button" className="button primary" disabled={saving || !procurementPlanDrafts[key]} onClick={() => void saveProcurementPlanRow(row).then((didSave) => { if (didSave) setFinanceCellEditor(null); })}><Save size={14} /> {saving ? "Saving…" : "Save row"}</button>
                    </div>}
                  </dialog>
                </div>;
              })()}
            </section>
          ) : (
          <div className={`builder-layout ${activeTab === "activities" ? "activities-layout" : ""} ${activeTab === "calendar" ? "calendar-builder-layout" : ""} ${activeTab === "beneficiaries" ? "beneficiaries-layout" : ""}`}>
            <section className="builder-panel">
              {showProgramDetailDialog || activeTab === "details" ? (
                <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setShowProgramDetailDialog(false); setActiveTab("settings"); setSettingsSection("programs"); }}>
                <dialog open={showProgramDetailDialog} className="form-section profile-dialog">
                  <div className="section-title">
                    <div>
                      <p className="eyebrow">User profile</p>
                      <h2>Program details</h2>
                      <p>
                        Make this workspace recognizable to every operating
                        unit.
                      </p>
                    </div>
                    <div className="detail-actions">{!programDialogEditing && programDialogTab === "details" && <button className="button secondary" onClick={() => setProgramDialogEditing(true)}>Edit program</button>}{programDialogEditing && <button className="button primary" onClick={() => void saveProgramChanges().then((success) => { if (success) setProgramDialogEditing(false); })}><Save size={14} /> Save</button>}<span className="step-number">01</span></div>
                  </div>
                  <button className="icon-button profile-dialog-close" aria-label="Close program details" onClick={() => { setShowProgramDetailDialog(false); setActiveTab("settings"); setSettingsSection("programs"); }}><X size={17} /></button>
                  <div className="program-dialog-tabs"><button className={programDialogTab === "details" ? "activity-view active" : "activity-view"} onClick={() => setProgramDialogTab("details")}>Program details</button><button className={programDialogTab === "admins" ? "activity-view active" : "activity-view"} onClick={() => setProgramDialogTab("admins")}>Admin accounts</button></div>
                  {programDialogTab === "details" ? <>
                  <div className="logo-row">
                    <div className="logo-preview">
                      {program.logo ? (
                        <img src={program.logo} alt="Program logo preview" />
                      ) : (
                        <ShieldCheck size={26} />
                      )}
                    </div>
                    <div className="logo-copy">
                      <strong>Program logo</strong>
                      <p>PNG or JPG, up to 2 MB. Recommended 240 x 240 px.</p>
                      <label className="upload-button">
                        <Upload size={14} /> Upload logo
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          disabled={!programDialogEditing}
                          onChange={handleLogo}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="form-grid two-col">
                    <label>
                      Program name
                      <input
                        value={program.title}
                        disabled={!programDialogEditing}
                        onChange={(e) => updateProgram("title", e.target.value)}
                      />
                    </label>
                    <label>
                      Acronym
                      <input
                        value={program.acronym}
                        disabled={!programDialogEditing}
                        onChange={(e) =>
                          updateProgram("acronym", e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <div className="form-grid two-col">
                    <label>
                      Agency title
                      <input
                        value={program.agency}
                        disabled={!programDialogEditing}
                        onChange={(e) =>
                          updateProgram("agency", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Regional office / subtitle
                      <input
                        value={program.office}
                        disabled={!programDialogEditing}
                        onChange={(e) =>
                          updateProgram("office", e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Description & objectives
                    <textarea
                      value={program.description}
                      disabled={!programDialogEditing}
                      onChange={(e) =>
                        updateProgram("description", e.target.value)
                      }
                      rows={3}
                    />
                  </label>
                  <div className="form-grid two-col">
                    <label>
                      Target beneficiaries
                      <input
                        value={program.beneficiaries}
                        disabled={!programDialogEditing}
                        onChange={(e) =>
                          updateProgram("beneficiaries", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Operating units / divisions
                      <input
                        value={program.units}
                        disabled={!programDialogEditing}
                        onChange={(e) => updateProgram("units", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="section-title appearance-title">
                    <div>
                      <h2>Appearance</h2>
                      <p>
                        Set colors used across this program's public-facing
                        surfaces.
                      </p>
                    </div>
                    <span className="step-number">02</span>
                  </div>
                  <div className="color-grid">
                    <label>
                      Primary color
                      <div className="color-input">
                        <input
                          type="color"
                          value={program.primary}
                          disabled={!programDialogEditing}
                          onChange={(e) =>
                            updateProgram("primary", e.target.value)
                          }
                        />
                        <span>{program.primary}</span>
                      </div>
                    </label>
                    <label>
                      Accent color
                      <div className="color-input">
                        <input
                          type="color"
                          value={program.accent}
                          disabled={!programDialogEditing}
                          onChange={(e) =>
                            updateProgram("accent", e.target.value)
                          }
                        />
                        <span>{program.accent}</span>
                      </div>
                    </label>
                  </div>
                  <label className="banner-drop">
                    <ImagePlus size={20} />
                    <div>
                      <strong>Program banner image</strong>
                      <p>Drop an image here or browse. JPG, PNG up to 5 MB.</p>
                    </div>
                    <span className="quiet-button">
                      Browse
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={handleBanner}
                      />
                    </span>
                  </label>
                  </> : <div className="program-admins-panel">
                    <div className="section-title">
                      <div><p className="eyebrow">Access management</p><h2>Program accounts</h2><p>Manage program admins and viewers for {program.acronym}.</p></div>
                    </div>
                    <div className="member-invite">
                      <h3>Create program account</h3>
                      <div className="settings-create">
                        <input value={accountForm.fullName} onChange={(event) => setAccountForm({ ...accountForm, fullName: event.target.value })} placeholder="Full name" />
                        <input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} placeholder="Email address" />
                        <input type="password" minLength={8} value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder="Temporary password (8+ characters)" />
                        <select value={accountForm.role === "program_admin" && systemRole === "superadmin" ? "program_admin" : "viewer"} disabled={systemRole !== "superadmin"} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value === "program_admin" ? "program_admin" : "viewer" })} aria-label="Program account role">
                          {systemRole === "superadmin" && <option value="program_admin">Program admin</option>}
                          <option value="viewer">Viewer</option>
                        </select>
                        <button className="button secondary" onClick={() => void createAccount()}><Plus size={15} /> Create {systemRole === "superadmin" && accountForm.role === "program_admin" ? "program admin" : "viewer"}</button>
                      </div>
                    </div>
                    <div className="program-admin-list">
                      {members.map((member) => <div className="settings-row" key={member.id}>
                        <span>{member.profile?.full_name ?? "Unnamed account"}</span>
                        <small>{member.profile?.email}</small>
                        <b>{member.role}</b>
                        <button className="icon-button" aria-label={`Edit ${member.profile?.full_name ?? "account"}`} onClick={() => { setAccountForm({ email: member.profile?.email ?? "", fullName: member.profile?.full_name ?? "", password: "", role: member.role === "program_admin" ? "program_admin" : "viewer" }); setMemberDialog(member); }}><Settings size={15} /></button>
                        <button className="icon-button danger" aria-label={`Remove ${member.profile?.full_name ?? "account"} from this program`} onClick={() => void deleteMemberAccount(member)}><Trash2 size={15} /></button>
                      </div>)}
                      {members.length === 0 && <div className="empty-state">No program accounts assigned yet.</div>}
                    </div>
                  </div>}
                </dialog>
                </div>
              ) : null}
              {activeTab === "calendar" && (
                <section className="calendar-page">
                  <div className="calendar-toolbar">
                    <div>
                      <p className="eyebrow">{program.acronym} · Activity schedule</p>
                      <h2>{calendarMonthTitle}</h2>
                      <p>Choose a day to review activities, edit schedules, or add a shared note.</p>
                    </div>
                    <div className="calendar-month-actions">
                      <button className="button secondary" onClick={() => { const now = new Date(); setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedCalendarDay(toLocalDateKey(now)); }}>Today</button>
                      <button className="icon-button" aria-label="Previous month" onClick={() => { const month = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); setCalendarMonth(month); setSelectedCalendarDay(toLocalDateKey(month)); }}><ChevronLeft size={17} /></button>
                      <button className="icon-button" aria-label="Next month" onClick={() => { const month = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); setCalendarMonth(month); setSelectedCalendarDay(toLocalDateKey(month)); }}><ChevronRight size={17} /></button>
                    </div>
                  </div>
                  <div className="calendar-legend" aria-label="Activity status colors">
                    <span><i className="calendar-status-planning" /> Planning / Pending</span>
                    <span><i className="calendar-status-progress" /> In progress</span>
                    <span><i className="calendar-status-revision" /> For revision</span>
                    <span><i className="calendar-status-completed" /> Completed</span>
                    <span><i className="calendar-status-other" /> Other status</span>
                  </div>
                  <div className="calendar-layout">
                    <section className="calendar-month-card" aria-label={`${calendarMonthTitle} activity calendar`}>
                      <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
                      <div className="calendar-grid">
                        {calendarDays.map(({ date, key, inMonth }) => {
                          const dayActivities = scheduledCalendarActivities.filter((activity) =>
                            activity.startDate <= key && getActivityCalendarEndDate(activity) >= key,
                          );
                          return <div key={key} className={`calendar-day ${inMonth ? "" : "outside-month"} ${selectedCalendarDay === key ? "selected" : ""} ${toLocalDateKey(new Date()) === key ? "today" : ""}`} onClick={(event) => {
                            if ((event.target as HTMLElement).closest("button")) return;
                            setSelectedCalendarDay(key);
                            setCalendarDialogDay(key);
                            if (!inMonth) setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                          }}>
                            <button className="calendar-day-number" aria-label={`Show activities for ${date.toLocaleDateString()}`} aria-pressed={selectedCalendarDay === key} onClick={() => { setSelectedCalendarDay(key); setCalendarDialogDay(key); if (!inMonth) setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}>{date.getDate()}</button>
                            {calendarDayNotes[`${program.id}:${key}`] && <span className="calendar-note-indicator" title="This day has a note">Note</span>}
                            <div className="calendar-day-events">
                              {dayActivities.slice(0, 2).map((activity) => <button className={`calendar-event ${calendarActivityColorClass(activity.status)}`} key={activity.id} title={`${activity.name} · ${activity.status}`} onClick={() => { setSelectedActivityId(activity.id); setActivityDialogTab("workflow"); setExpandedTimelineSteps({}); setPendingTimelineStep(null); setShowActivityDialog(true); setActiveTab("activities"); }}>{activity.name}</button>)}
                              {dayActivities.length > 2 && <span className="calendar-more">+{dayActivities.length - 2} more</span>}
                            </div>
                          </div>;
                        })}
                      </div>
                    </section>
                  </div>
                  {unscheduledCalendarActivities.length > 0 && <details className="calendar-unscheduled">
                    <summary className="calendar-unscheduled-summary"><span><p className="eyebrow">Unscheduled activities</p><h3>Needs a date</h3></span><small>{unscheduledCalendarActivities.length} activity{unscheduledCalendarActivities.length === 1 ? "" : "ies"}</small></summary>
                    <div className="calendar-unscheduled-list">{unscheduledCalendarActivities.map((activity) => <article className={`calendar-event-row ${calendarActivityColorClass(activity.status)}`} key={activity.id}>
                      <span className="calendar-dialog-activity-heading"><button type="button" className="calendar-activity-open" onClick={() => { setSelectedActivityId(activity.id); setActivityDialogTab("workflow"); setExpandedTimelineSteps({}); setPendingTimelineStep(null); setShowActivityDialog(true); setActiveTab("activities"); }}>{activity.name}</button><span className={`status-tag ${calendarActivityColorClass(activity.status)}`}>{activity.status}</span></span>
                      <small>FY {getActivityYear(activity) ?? "Not set"} · No schedule</small>
                      {canEdit && (!activity.activityCode.startsWith("APP-") || isAdmin) && (
                        calendarScheduleEditingId === activity.id && calendarScheduleDraft
                          ? <div className="calendar-schedule-editor">
                            <label>{calendarScheduleDraft.isAppSchedule ? "Start month" : "Start date"}<input type={calendarScheduleDraft.isAppSchedule ? "month" : "date"} value={calendarScheduleDraft.startDate} onChange={(event) => setCalendarScheduleDraft({ ...calendarScheduleDraft, startDate: event.target.value })} /></label>
                            <label>{calendarScheduleDraft.isAppSchedule ? "End month" : "End date"}<input type={calendarScheduleDraft.isAppSchedule ? "month" : "date"} value={calendarScheduleDraft.endDate} onChange={(event) => setCalendarScheduleDraft({ ...calendarScheduleDraft, endDate: event.target.value })} /></label>
                            <div><button type="button" className="button secondary" disabled={calendarScheduleSaving} onClick={() => { setCalendarScheduleEditingId(null); setCalendarScheduleDraft(null); }}>Cancel</button><button type="button" className="button primary" disabled={calendarScheduleSaving} onClick={() => void saveCalendarSchedule(activity)}><Save size={13} /> {calendarScheduleSaving ? "Saving…" : "Schedule"}</button></div>
                          </div>
                          : <button type="button" className="button secondary" disabled={calendarScheduleSaving} onClick={() => editCalendarSchedule(activity)}>Set schedule</button>
                      )}
                    </article>)}</div>
                  </details>}
                  {calendarDialogDay && (() => {
                    const activitiesOnDay = scheduledCalendarActivities.filter((activity) =>
                      activity.startDate <= calendarDialogDay && getActivityCalendarEndDate(activity) >= calendarDialogDay,
                    );
                    const dayLabel = new Date(`${calendarDialogDay}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "long", month: "long", day: "numeric", year: "numeric",
                    });
                    return <div className="dialog-overlay" onClick={(event) => { if (event.target === event.currentTarget) setCalendarDialogDay(null); }}>
                      <dialog open className="activity-dialog calendar-day-dialog" aria-labelledby="calendar-day-dialog-title">
                        <div className="detail-heading">
                          <div><p className="eyebrow">{program.acronym} · Calendar</p><h2 id="calendar-day-dialog-title">{dayLabel}</h2><p className="detail-subtitle">{activitiesOnDay.length} scheduled activit{activitiesOnDay.length === 1 ? "y" : "ies"}</p></div>
                          <button className="icon-button" aria-label="Close day activities" onClick={() => setCalendarDialogDay(null)}><X size={17} /></button>
                        </div>
                        {activitiesOnDay.length
                          ? <div className="calendar-dialog-activities">{activitiesOnDay.map((activity) => <article className={`calendar-event-row calendar-dialog-activity ${calendarActivityColorClass(activity.status)}`} key={activity.id}>
                            <span className="calendar-dialog-activity-heading"><button type="button" className="calendar-activity-open" onClick={() => { setCalendarDialogDay(null); setSelectedActivityId(activity.id); setActivityDialogTab("workflow"); setExpandedTimelineSteps({}); setPendingTimelineStep(null); setShowActivityDialog(true); setActiveTab("activities"); }}>{activity.name}</button><span className={`status-tag ${calendarActivityColorClass(activity.status)}`}>{activity.status}</span></span>
                            <small>{activity.location || "No location"} · {formatActivitySchedule(activity)}</small>
                            <small>Approved budget ₱{activity.budget.toLocaleString()}</small>
                            {canEdit && (!activity.activityCode.startsWith("APP-") || isAdmin) && <div className="calendar-schedule-actions">
                              {calendarScheduleEditingId === activity.id && calendarScheduleDraft
                                ? <div className="calendar-schedule-editor">
                                  <label>{calendarScheduleDraft.isAppSchedule ? "Start month" : "Start date"}<input type={calendarScheduleDraft.isAppSchedule ? "month" : "date"} value={calendarScheduleDraft.startDate} onChange={(event) => setCalendarScheduleDraft({ ...calendarScheduleDraft, startDate: event.target.value })} /></label>
                                  <label>{calendarScheduleDraft.isAppSchedule ? "End month" : "End date"}<input type={calendarScheduleDraft.isAppSchedule ? "month" : "date"} value={calendarScheduleDraft.endDate} onChange={(event) => setCalendarScheduleDraft({ ...calendarScheduleDraft, endDate: event.target.value })} /></label>
                                  <div><button type="button" className="button secondary" disabled={calendarScheduleSaving} onClick={() => { setCalendarScheduleEditingId(null); setCalendarScheduleDraft(null); }}>Cancel</button><button type="button" className="button primary" disabled={calendarScheduleSaving} onClick={() => void saveCalendarSchedule(activity)}><Save size={13} /> {calendarScheduleSaving ? "Saving…" : "Save dates"}</button></div>
                                </div>
                                : <button type="button" className="button secondary" disabled={calendarScheduleSaving} onClick={() => editCalendarSchedule(activity)}>Edit schedule</button>}
                            </div>}
                          </article>)}</div>
                          : <p className="calendar-empty calendar-dialog-empty">No activities scheduled for this day.</p>}
                        <section className="calendar-note-editor">
                          <label htmlFor="calendar-day-note">Notes for this day</label>
                          <textarea id="calendar-day-note" value={calendarNoteDrafts[`${program.id}:${calendarDialogDay}`] ?? calendarDayNotes[`${program.id}:${calendarDialogDay}`]?.note ?? ""} maxLength={4000} disabled={!canEdit || !databaseConfigured || calendarNotesLoading || calendarNotesUnavailable} placeholder={calendarNotesUnavailable ? "Saved notes could not be loaded." : canEdit ? "Add a reminder or note for this day…" : "No note has been added for this day."} onChange={(event) => { const key = `${program.id}:${calendarDialogDay}`; setCalendarNoteDrafts((current) => ({ ...current, [key]: event.target.value })); }} />
                          <div className="calendar-note-footer">
                            <small>{calendarNotesLoading ? "Loading saved notes…" : calendarNotesUnavailable ? "Notes could not be loaded." : "Notes are shared with members of this program."}</small>
                            {calendarNotesUnavailable && canEdit && <button type="button" className="button secondary" onClick={() => setCalendarNotesReloadToken((current) => current + 1)}>Retry</button>}
                            {canEdit && <button type="button" className="button primary" disabled={!databaseConfigured || calendarNoteSaving || calendarNotesLoading || calendarNotesUnavailable} onClick={() => void saveCalendarNoteDraft()}><Save size={13} /> {calendarNoteSaving ? "Saving…" : "Save note"}</button>}
                          </div>
                        </section>
                      </dialog>
                    </div>;
                  })()}
                </section>
              )}
              {activeTab === "beneficiaries" && (
                <section className="beneficiary-page">
                  <div className="beneficiary-toolbar">
                    <div>
                      <p className="eyebrow">{systemRole === "superadmin" ? "System register" : `${program.acronym} register`}</p>
                      <h2>Beneficiary FCAs</h2>
                      <p>Maintain Farmers’ Cooperatives and Associations, their locations, membership, and the interventions provided. Only this program's administrator can add, edit, or delete records.</p>
                    </div>
                    <div className="beneficiary-toolbar-actions">
                      <label className="activity-search"><Search size={16} /><input value={beneficiarySearch} onChange={(event) => setBeneficiarySearch(event.target.value)} placeholder="Search beneficiaries" aria-label="Search beneficiaries" /></label>
                      {systemRole === "superadmin" && <label className="beneficiary-program-filter">Program<select value={beneficiaryProgramFilter} onChange={(event) => setBeneficiaryProgramFilter(event.target.value)}><option value="all">All programs</option>{programOptions.map((item) => <option key={item.id} value={item.id}>{item.acronym} — {item.title}</option>)}</select></label>}
                      {canEditBeneficiaries && <button type="button" className="button primary" onClick={() => openBeneficiaryForm()}><Plus size={15} /> Add beneficiary</button>}
                    </div>
                  </div>
                  <div className="beneficiary-summary">
                    <div><small>Records</small><strong>{visibleBeneficiaryRecords.length}</strong></div>
                    <div><small>Linked to interventions</small><strong>{visibleBeneficiaryRecords.filter((record) => record.activity_ids.length > 0).length}</strong></div>
                    <div><small>Showing</small><strong>{filteredBeneficiaryRecords.length}</strong></div>
                  </div>
                  <div className="beneficiary-table-wrap">
                    <table className="beneficiary-table">
                      <thead><tr><th>Beneficiary FCA</th><th>Program</th><th>FCA category</th><th>Members</th><th>Contact person / number</th><th>Province / Municipality / Barangay</th><th>Activities / interventions</th><th>Other assistance / interventions received</th><th>Additional details</th>{canEditBeneficiaries && <th>Actions</th>}</tr></thead>
                      <tbody>
                        {beneficiaryTableLoading
                          ? <tr><td colSpan={canEditBeneficiaries ? 10 : 9} className="beneficiary-empty">Loading beneficiary FCAs…</td></tr>
                          : filteredBeneficiaryRecords.map((record) => {
                            const recordProgram = programOptions.find((option) => option.id === record.program_id);
                            const recordActivities = (activitiesByProgram[record.program_id] ?? [])
                              .filter((activity) => record.activity_ids.includes(activity.id));
                            return <tr key={record.id}>
                              <td><strong>{record.beneficiary_name || record.beneficiary_acronym || "Unnamed FCA"}</strong>{record.beneficiary_name && record.beneficiary_acronym && <small>{record.beneficiary_acronym}</small>}</td>
                              <td>{recordProgram ? `${recordProgram.acronym} — ${recordProgram.title}` : "Program"}</td>
                              <td>{record.fca_category || "Not specified"}</td>
                              <td>{record.membership_count ?? "Not specified"}</td>
                              <td>{[record.contact_person, record.contact_number].filter(Boolean).join(" · ") || "Not specified"}</td>
                              <td>{[record.province, record.municipality, record.barangay].filter(Boolean).join(" · ") || "Not specified"}</td>
                              <td>{recordActivities.length ? recordActivities.map((activity) => activity.name).join(", ") : "Not linked"}</td>
                              <td>{record.other_assistance_interventions || "—"}</td>
                              <td>{record.additional_details || "—"}</td>
                              {canEditBeneficiaries && <td><div className="beneficiary-row-actions"><button type="button" className="button secondary" onClick={() => openBeneficiaryForm(record)}>Edit</button><button type="button" className="button danger-outline" onClick={() => setBeneficiaryToDelete(record)}>Delete</button></div></td>}
                            </tr>;
                          })}
                        {!beneficiaryTableLoading && filteredBeneficiaryRecords.length === 0 && <tr><td colSpan={canEditBeneficiaries ? 10 : 9} className="beneficiary-empty">{beneficiarySearch.trim() ? "No records match your search." : "No beneficiary FCAs have been added yet."}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {beneficiaryDialogOpen && canEditBeneficiaries && <div className="dialog-overlay" onClick={(event) => { if (event.target === event.currentTarget && !beneficiarySaving) setBeneficiaryDialogOpen(false); }}>
                    <dialog open className="activity-dialog beneficiary-dialog">
                      <div className="detail-heading"><div><p className="eyebrow">Beneficiary FCA register</p><h2>{beneficiaryEditingId ? "Edit beneficiary FCA" : "Add beneficiary FCA"}</h2><p className="detail-subtitle">Provide the FCA identity, membership and contact information, location, and interventions provided.</p></div><button type="button" className="icon-button" aria-label="Close beneficiary FCA form" disabled={beneficiarySaving} onClick={() => setBeneficiaryDialogOpen(false)}><X size={17} /></button></div>
                      <div className="beneficiary-form-grid">
                        <label>FCA name<input value={beneficiaryForm.beneficiary_name} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, beneficiary_name: event.target.value }))} autoComplete="organization" /></label>
                        <label>FCA acronym<input value={beneficiaryForm.beneficiary_acronym} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, beneficiary_acronym: event.target.value }))} autoComplete="off" /></label>
                        <label>FCA category / type<input value={beneficiaryForm.fca_category} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, fca_category: event.target.value }))} placeholder="Farmers association, cooperative, etc." /></label>
                        <label>Number of members<input type="number" min="0" step="1" value={beneficiaryForm.membership_count} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, membership_count: event.target.value }))} /></label>
                        <label>Contact person<input value={beneficiaryForm.contact_person} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, contact_person: event.target.value }))} autoComplete="name" /></label>
                        <label>Contact number<input type="tel" value={beneficiaryForm.contact_number} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, contact_number: event.target.value }))} autoComplete="tel" /></label>
                        <div className="beneficiary-form-wide beneficiary-intervention-picker">
                          <span>Activities / interventions provided (select all that apply)</span>
                          {(activitiesByProgram[beneficiaryForm.program_id] ?? (beneficiaryForm.program_id === program.id ? activities : [])).length
                            ? (activitiesByProgram[beneficiaryForm.program_id] ?? (beneficiaryForm.program_id === program.id ? activities : [])).map((activity) => <label key={activity.id}><input type="checkbox" checked={beneficiaryForm.activity_ids.includes(activity.id)} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, activity_ids: event.target.checked ? [...current.activity_ids, activity.id] : current.activity_ids.filter((id) => id !== activity.id) }))} /><span>{activity.name}</span></label>)
                            : <small>No activities are available for this program.</small>}
                        </div>
                        <label>Province<input value={beneficiaryForm.province} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, province: event.target.value }))} /></label>
                        <label>Municipality<input value={beneficiaryForm.municipality} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, municipality: event.target.value }))} /></label>
                        <label>Barangay<input value={beneficiaryForm.barangay} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, barangay: event.target.value }))} /></label>
                        <label className="beneficiary-form-wide">Other assistance/interventions received<textarea rows={3} value={beneficiaryForm.other_assistance_interventions} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, other_assistance_interventions: event.target.value }))} /></label>
                        <label className="beneficiary-form-wide">Additional details<textarea rows={3} value={beneficiaryForm.additional_details} onChange={(event) => setBeneficiaryForm((current) => ({ ...current, additional_details: event.target.value }))} /></label>
                      </div>
                      <div className="beneficiary-form-actions"><button type="button" className="button secondary" disabled={beneficiarySaving} onClick={() => setBeneficiaryDialogOpen(false)}>Cancel</button><button type="button" className="button primary" disabled={beneficiarySaving} onClick={() => void saveBeneficiaryRecord()}><Save size={14} /> {beneficiarySaving ? "Saving…" : "Save beneficiary"}</button></div>
                    </dialog>
                  </div>}
                  {beneficiaryToDelete && canEditBeneficiaries && <div className="dialog-overlay" onClick={(event) => { if (event.target === event.currentTarget && !beneficiaryDeleting) setBeneficiaryToDelete(null); }}>
                    <dialog open className="activity-dialog beneficiary-delete-dialog">
                      <div className="detail-heading"><div><p className="eyebrow">Confirm deletion</p><h2>Delete beneficiary record?</h2><p className="detail-subtitle">This cannot be undone. The record for {beneficiaryToDelete.beneficiary_name || beneficiaryToDelete.beneficiary_acronym || "this beneficiary"} will be permanently removed.</p></div><button type="button" className="icon-button" aria-label="Close deletion confirmation" disabled={beneficiaryDeleting} onClick={() => setBeneficiaryToDelete(null)}><X size={17} /></button></div>
                      <div className="beneficiary-form-actions"><button type="button" className="button secondary" disabled={beneficiaryDeleting} onClick={() => setBeneficiaryToDelete(null)}>Cancel</button><button type="button" className="button danger-outline" disabled={beneficiaryDeleting} onClick={() => void deleteBeneficiaryRecord()}><Trash2 size={14} /> {beneficiaryDeleting ? "Deleting…" : "Delete record"}</button></div>
                    </dialog>
                  </div>}
                </section>
              )}
              {activeTab === "activities" && (
                <div className="activity-panel">
                  <div className="activity-toolbar">
                    <div>
                      <p className="eyebrow">
                        {program.acronym} activity register
                      </p>
                      <h2>Activities</h2>
                      <p>
                        Activities are created from project titles in the Finance APP sheet and appear here automatically.
                      </p>
                    </div>
                    <label className="activity-search"><Search size={16} /><input value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} placeholder="Search activities, locations, or status" aria-label="Search activities" /></label>
                  </div>
                  <div className="activity-tabs" role="tablist" aria-label="Activity views">
                    <span className="activity-view active"><Table2 size={15} /> Activity table</span>
                  </div>
                  {showActivityForm && (
                    <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setShowActivityForm(false); setEditingActivityId(null); }}>
                    <dialog open className="activity-form activity-dialog">
                      <div className="activity-form-heading"><div><p className="eyebrow">Activity register</p><h2>Edit activity</h2><p>Update the activity details and current workflow position.</p></div><button className="icon-button" aria-label="Close activity form" onClick={() => { setShowActivityForm(false); setEditingActivityId(null); }}><X size={17} /></button></div>
                      <label>
                        Activity name
                        <input
                          value={newActivity.name}
                          onChange={(event) =>
                            setNewActivity({
                              ...newActivity,
                              name: event.target.value,
                            })
                          }
                          placeholder="e.g. Activity procurement for farm inputs"
                        />
                      </label>
                      <label>
                        Location / province
                        <input
                          value={newActivity.location}
                          onChange={(event) =>
                            setNewActivity({
                              ...newActivity,
                              location: event.target.value,
                            })
                          }
                          placeholder="Province or municipality"
                        />
                      </label>
                      <label>
                        Start date
                        <input
                          type="date"
                          value={newActivity.startDate}
                          onChange={(event) =>
                            setNewActivity({
                              ...newActivity,
                              startDate: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Target end date
                        <input
                          type="date"
                          value={newActivity.endDate}
                          onChange={(event) =>
                            setNewActivity({
                              ...newActivity,
                              endDate: event.target.value,
                            })
                          }
                        />
                      </label>
                          <label>
                        Approved budget
                        <input
                          type="number"
                          min="0"
                          value={newActivity.budget}
                          disabled={!canManageFinance}
                          onChange={(event) =>
                            setNewActivity({
                              ...newActivity,
                              budget: event.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </label>
                          <label>
                            Obligations
                            <input type="number" min="0" value={newActivity.spent} disabled={!canManageFinance} onChange={(event) => setNewActivity({ ...newActivity, spent: event.target.value })} placeholder="0.00" />
                            <small>Total activity obligations, including obligated supplier lines. Changes here update the unitemized portion.</small>
                          </label>
                          <label>
                            Current workflow step
                            <select value={newActivity.currentStep || steps[0]?.title} onChange={(event) => setNewActivity({ ...newActivity, currentStep: event.target.value, currentSubStep: steps.find((step) => step.title === event.target.value)?.subSteps?.[0] ?? "" })}>
                              {activeSteps.map((step, index) => <option key={step.id} value={step.title}>{index + 1}. {step.title}</option>)}
                            </select>
                          </label>
                          <label>
                            Current sub-step
                            <select value={newActivity.currentSubStep || steps.find((step) => step.title === newActivity.currentStep)?.subSteps?.[0] || ""} onChange={(event) => setNewActivity({ ...newActivity, currentSubStep: event.target.value })}>
                              {(steps.find((step) => step.title === newActivity.currentStep)?.subSteps ?? []).map((subStep, index) => <option key={subStep} value={subStep}>{(activeSteps.findIndex((step) => step.title === newActivity.currentStep) + 1)}.{index + 1} {subStep}</option>)}
                            </select>
                          </label>
                      <div className="activity-form-actions">
                        <button
                          className="button secondary"
                          onClick={() => { setShowActivityForm(false); setEditingActivityId(null); }}
                        >
                          Cancel
                        </button>
                        <button
                          className="button primary"
                          onClick={saveActivity}
                        >
                          {editingActivityId ? "Update activity" : "Save activity"}
                        </button>
                      </div>
                    </dialog>
                    </div>
                  )}
                  {activityView === "timeline" ? (
                    <div className="activity-layout">
                      <div className="activity-list">
                        {filteredActivities.map((activity) => (
                          <button
                            key={activity.id}
                            className={`activity-card ${selectedActivity?.id === activity.id ? "selected" : ""}`}
                            onClick={() => { setSelectedActivityId(activity.id); setActivityDialogTab("workflow"); setExpandedTimelineSteps({}); setPendingTimelineStep(null); setShowActivityDialog(true); }}
                          >
                            <div className="activity-card-top">
                              <strong>{activity.name}</strong>
                              <span className={`status-tag ${activity.status === "Completed" ? "status-completed" : "status-progress"}`}>
                                {activity.status}
                              </span>
                            </div>
                            <small>
                                {activity.location || "No location"} <span>•</span>{" "}
                                {formatActivitySchedule(activity)}
                            </small>
                            <div className="activity-card-meta">
                              <span>
                                <DollarSign size={13} /> ₱
                                {activity.spent.toLocaleString()} / ₱
                                {activity.budget.toLocaleString()}
                              </span>
                              <span>{getNumberedStep(steps, activity.currentStep)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      {selectedActivity && showActivityDialog && (
                        <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setSelectedActivityId(""); setShowActivityDialog(false); }}>
                        <dialog open className="activity-detail activity-dialog timeline-activity-dialog">
                          <div className="detail-heading timeline-dialog-header">
                            <div>
                              <p className="eyebrow">Activity timeline</p>
                              <h2>{selectedActivity.name}</h2>
                              <p className="detail-subtitle">
                                {selectedActivity.location} ·{" "}
                                {formatActivitySchedule(selectedActivity)}
                              </p>
                            </div>
                            <div className="detail-actions">
                              {canEdit && !selectedActivity.activityCode.startsWith("APP-") && <button className="button secondary" onClick={() => editActivity(selectedActivity)}>Edit activity</button>}
                              {isAdmin && !selectedActivity.activityCode.startsWith("APP-") && <button className="icon-button danger" aria-label="Delete activity" onClick={() => deleteActivity(selectedActivity.id)}><Trash2 size={17} /></button>}
                              <button className="icon-button" aria-label="Close activity" onClick={() => { setSelectedActivityId(""); setShowActivityDialog(false); }}><X size={17} /></button>
                            </div>
                          </div>
                          <div className="activity-dialog-tabs" role="tablist" aria-label="Activity details">
                            <button className={activityDialogTab === "timeline" ? "activity-dialog-tab active" : "activity-dialog-tab"} onClick={() => setActivityDialogTab("timeline")}>Timeline</button>
                            <button className={activityDialogTab === "design" ? "activity-dialog-tab active" : "activity-dialog-tab"} onClick={() => setActivityDialogTab("design")}>Activity design</button>
                          </div>
                          {activityDialogTab === "timeline" ? (
                          <div className="timeline-dialog-body">
                          <div className="fund-summary timeline-summary">
                          <div>
                            <small>Approved budget</small>
                              <strong>
                                ₱{selectedActivity.budget.toLocaleString()}
                              </strong>
                            </div>
                            <div>
                              <small>Obligations</small>
                              <strong>
                                ₱{selectedActivity.spent.toLocaleString()}
                              </strong>
                            </div>
                            <div>
                              <small>Available balance</small>
                              <strong>
                                ₱
                                {(
                                  selectedActivity.budget -
                                  selectedActivity.spent
                                ).toLocaleString()}
                              </strong>
                            </div>
                          </div>
                          <div className="timeline-section-label">Workflow progress</div>
                          {activeSteps.length > 0 && <label className="workflow-step-picker">
                            Select workflow step
                            <select
                              value={selectedActivityWorkflowStep?.id ?? ""}
                              onChange={(event) => setWorkflowStepSelections((current) => ({ ...current, [selectedActivity.id]: event.target.value }))}
                            >
                              {activeSteps.map((step, index) => <option key={step.id} value={step.id}>{index + 1}. {step.title}</option>)}
                            </select>
                          </label>}
                          {workflowProcurementSummary}
                          <div className="timeline">
                            {selectedActivityWorkflowStep ? [selectedActivityWorkflowStep].map((step) => {
                              const index = selectedActivityWorkflowIndex;
                              const currentStepIndex = activeSteps.findIndex((item) => item.title === selectedActivity.currentStep);
                              const stepDone = index < currentStepIndex || selectedActivity.status === "Completed";
                              const stepCurrent = index === currentStepIndex && selectedActivity.status !== "Completed";
                              const currentSubStepIndex = (step.subSteps ?? []).indexOf(selectedActivity.currentSubStep ?? "");
                              const subSteps = step.subSteps ?? [];
                              const completedSubSteps = getCompletedSubSteps(selectedActivity, step, index);
                              const allSubStepsDone = subSteps.length > 0
                                ? completedSubSteps.length === subSteps.length
                                : stepDone;
                              const parentDone = stepDone || allSubStepsDone;
                              const timelineStepKey = `${selectedActivity.id}:${step.id}`;
                              const expanded = expandedTimelineSteps[timelineStepKey] ?? false;
                              return (
                              <div
                                className={`timeline-step ${parentDone ? "complete" : "pending"} ${stepCurrent ? "current" : ""} ${expanded ? "expanded" : "collapsed"}`}
                                key={step.id}
                              >
                                <div className="timeline-marker">
                                  {parentDone ? (
                                    <Check size={12} />
                                  ) : (
                                    index + 1
                                  )}
                                </div>
                                <div>
                                  <div className="timeline-step-heading-row">
                                    <button
                                      type="button"
                                      className="timeline-step-toggle"
                                      aria-expanded={expanded}
                                      onClick={() => toggleTimelineStep(selectedActivity.id, step.id, false)}
                                    >
                                      <span className="timeline-step-heading">
                                        <strong>{index + 1}. {step.title}</strong>
                                        <small>
                                          {stepCurrent
                                            ? "Current activity stage"
                                            : stepDone
                                              ? "Completed"
                                              : `Target SLA · ${step.slaDays} days`}
                                        </small>
                                      </span>
                                      <ChevronDown size={16} aria-hidden="true" />
                                    </button>
                                  </div>
                                  {subSteps.length > 0 && <div className="timeline-substeps">
                                    {subSteps.map((subStep, subStepIndex) => {
                                      const subStepDone = completedSubSteps.includes(subStep);
                                      const subStepChecked = pendingTimelineStep?.stepTitle === step.title && pendingTimelineStep.subStep === subStep
                                        ? pendingTimelineStep.shouldComplete
                                        : subStepDone;
                                      const subStepCurrent = stepCurrent && subStepIndex === currentSubStepIndex;
                                      return <label className={`timeline-substep ${subStepDone ? "complete" : "pending"} ${subStepCurrent ? "current" : ""}`} key={subStep}>
                                        <input
                                          type="checkbox"
                                          checked={subStepChecked}
                                          disabled={!canEdit}
                                          onChange={() => requestTimelineSubStepChange(step, index, subStep)}
                                          aria-label={`Mark ${subStep} as complete`}
                                        />
                                        <em>{index + 1}.{subStepIndex + 1} {subStep}</em>
                                      </label>;
                                    })}
                                  </div>}
                                  {expanded && <div className="timeline-step-details">
                                    {canEdit && <label className="step-remark-field">
                                      <span>Admin remark</span>
                                      <textarea
                                        value={remarkDrafts[`${selectedActivity.id}:${step.id}`] ?? selectedActivity.stepRemarks?.[step.id] ?? ""}
                                        onChange={(event) => setRemarkDrafts((current) => ({ ...current, [`${selectedActivity.id}:${step.id}`]: event.target.value }))}
                                        placeholder="Add a note about this step"
                                        rows={2}
                                      />
                                    </label>}
                                  </div>}
                                </div>
                              </div>
                              );
                            }) : null}
                          </div>
                          <div className="activity-status-actions">
                            {canEdit && <button className="button primary" onClick={saveActivityChanges}><Save size={14} /> Save changes</button>}
                          </div>
                          </div>
                          ) : (
                            <div className="activity-design-panel">
                              <div>
                                <p className="eyebrow">Program activity design</p>
                                <h3>Activity design and implementation details</h3>
                                <p className="detail-subtitle">Document the design that will guide implementation for this activity.</p>
                              </div>
                              <div className="activity-program-details">
                                <div><small>Program</small><strong>{program.title} ({program.acronym})</strong></div>
                                <div><small>Agency / office</small><strong>{program.agency} · {program.office}</strong></div>
                                <div><small>Target beneficiaries</small><strong>{program.beneficiaries || "Not specified"}</strong></div>
                                <div><small>Operating units</small><strong>{program.units || "Not specified"}</strong></div>
                              </div>
                              <label>
                                Activity design
                                <textarea
                                  value={selectedActivity.activityDesign ?? ""}
                                  disabled={!canEdit}
                                  onChange={(event) => setActivities((current) => current.map((activity) => activity.id === selectedActivity.id ? { ...activity, activityDesign: event.target.value } : activity))}
                                  placeholder="Describe the activity design, approach, beneficiaries, outputs, and implementation arrangements."
                                  rows={12}
                                />
                              </label>
                              {canEdit && <div className="activity-status-actions"><button className="button primary" onClick={saveActivityDesign}><Save size={14} /> Save design</button></div>}
                            </div>
                          )}
                        </dialog>
                        </div>
                      )}
                      {pendingTimelineStep && (
                        <div className="dialog-overlay confirmation-overlay">
                          <dialog open className="activity-dialog confirmation-dialog" aria-labelledby="timeline-confirmation-title">
                            <p className="eyebrow">Confirm workflow update</p>
                            <h2 id="timeline-confirmation-title">Change current step?</h2>
                            <p className="confirmation-message">
                              Set <strong>{pendingTimelineStep.stepTitle}</strong>{pendingTimelineStep.subStep ? <> to <strong>{pendingTimelineStep.subStep}</strong></> : ""} as the current activity progress? This will update the activity status.
                            </p>
                            <div className="confirmation-actions">
                              <button className="button secondary" onClick={() => setPendingTimelineStep(null)}>Cancel</button>
                              <button className="button primary" onClick={confirmTimelineStepChange}>Confirm change</button>
                            </div>
                          </dialog>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="activity-table-wrap">
                      <table className="activity-table">
                        <thead>
                          <tr>
                            <th>Activity</th>
                            <th>Location</th>
                            <th>Schedule</th>
                            <th>Budget</th>
                            <th>Progress</th>
                            <th>Current step</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredActivities.map((activity) => (
                            <tr
                              key={activity.id}
                              onClick={() => {
                                setSelectedActivityId(activity.id);
                                setShowActivityDialog(true);
                              }}
                            >
                              <td>
                                <strong>{activity.name}</strong>
                                <small>{activity.id}</small>
                              </td>
                              <td>{activity.location}</td>
                              <td>
                                <span>{formatActivitySchedule(activity)}</span>
                              </td>
                              <td>
                                <strong>
                                  ₱{activity.budget.toLocaleString()}
                                </strong>
                                <small>
                                  Obligations ₱{activity.spent.toLocaleString()}
                                </small>
                              </td>
                              <td>
                                <div className="table-progress">
                                  <strong>{getActivityProgress(activity)}%</strong>
                                  <div className="progress-track" role="progressbar" aria-valuenow={getActivityProgress(activity)} aria-valuemin={0} aria-valuemax={100} aria-label={`${activity.name} workflow progress`}>
                                    <i style={{ width: `${getActivityProgress(activity)}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td>{getNumberedStep(steps, activity.currentStep)}</td>
                              <td>
                                <span className={`status-tag ${activity.status === "Completed" ? "status-completed" : "status-progress"}`}>
                                  {activity.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {selectedActivity && showActivityDialog && (
                    <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setShowActivityDialog(false); }}>
                      <dialog open className="activity-detail activity-dialog activity-design-dialog">
                        <div className="detail-heading">
                          <div>
                            <p className="eyebrow">Activity design</p>
                            <h2>{selectedActivity.name}</h2>
                            <p className="detail-subtitle">{program.title} ({program.acronym}) · {selectedActivity.location}</p>
                          </div>
                          <div className="detail-actions">
                            {canEdit && !selectedActivity.activityCode.startsWith("APP-") && <button className="button secondary" onClick={() => editActivity(selectedActivity)}>Edit activity</button>}
                            <button className="icon-button" aria-label="Close activity design" onClick={() => setShowActivityDialog(false)}><X size={17} /></button>
                          </div>
                        </div>
                        <div className="activity-dialog-tabs" role="tablist" aria-label="Activity details">
                          <button className={activityDialogTab === "design" ? "activity-dialog-tab active" : "activity-dialog-tab"} onClick={() => setActivityDialogTab("design")}>Activity design</button>
                          <button className={activityDialogTab === "workflow" ? "activity-dialog-tab active" : "activity-dialog-tab"} onClick={() => setActivityDialogTab("workflow")}>Workflow</button>
                          <button className={activityDialogTab === "procurement" ? "activity-dialog-tab active" : "activity-dialog-tab"} onClick={() => setActivityDialogTab("procurement")}>Suppliers & procurement</button>
                        </div>
                        {activityDialogTab === "workflow" ? (
                          <div className="timeline-dialog-body">
                            <div className="activity-program-details">
                              <div><small>Workflow progress</small><strong>{getActivityProgress(selectedActivity)}%</strong></div>
                              <div><small>Current step</small><strong>{getNumberedStep(steps, selectedActivity.currentStep)}</strong></div>
                            </div>
                            {activeSteps.length > 0 && <label className="workflow-step-picker">
                              Select workflow step
                              <select
                                value={selectedActivityWorkflowStep?.id ?? ""}
                                onChange={(event) => setWorkflowStepSelections((current) => ({ ...current, [selectedActivity.id]: event.target.value }))}
                              >
                                {activeSteps.map((step, index) => <option key={step.id} value={step.id}>{index + 1}. {step.title}</option>)}
                              </select>
                            </label>}
                            {workflowProcurementSummary}
                            <div className="timeline">
                              {selectedActivityWorkflowStep ? [selectedActivityWorkflowStep].map((step) => {
                                const index = selectedActivityWorkflowIndex;
                                const completed = getCompletedSubSteps(selectedActivity, step, index);
                                const currentIndex = activeSteps.findIndex((item) => item.title === selectedActivity.currentStep);
                                const stepDone = index < currentIndex || selectedActivity.status === "Completed";
                                const stepCurrent = index === currentIndex && !stepDone;
                                return <div className={`timeline-step ${stepDone || completed.length === (step.subSteps?.length ?? 0) ? "complete" : "pending"} ${stepCurrent ? "current" : ""}`} key={step.id}>
                                  <div className="timeline-marker">{stepDone ? <Check size={12} /> : index + 1}</div>
                                  <div>
                                    <div className="timeline-step-heading"><strong>{index + 1}. {step.title}</strong><small>{stepCurrent ? "Current activity stage" : stepDone ? "Completed" : `Target SLA · ${step.slaDays} days`}</small></div>
                                    <div className="timeline-substeps">
                                      {(step.subSteps ?? []).map((subStep, subStepIndex) => <label className={`timeline-substep ${completed.includes(subStep) ? "complete" : "pending"}`} key={subStep}>
                                        <input type="checkbox" checked={pendingTimelineStep?.stepTitle === step.title && pendingTimelineStep.subStep === subStep ? pendingTimelineStep.shouldComplete : completed.includes(subStep)} disabled={!canEdit} onChange={() => requestTimelineSubStepChange(step, index, subStep)} aria-label={`Mark ${subStep} as complete`} />
                                        <em>{index + 1}.{subStepIndex + 1} {subStep}</em>
                                      </label>)}
                                    </div>
                                  </div>
                                </div>;
                              }) : null}
                            </div>
                          </div>
                        ) : activityDialogTab === "procurement" ? (
                          procurementPanel
                        ) : (
                        <div className="activity-design-panel">
                          <div className="activity-program-details">
                            <div><small>Agency / office</small><strong>{program.agency} · {program.office}</strong></div>
                            <div><small>Target beneficiaries</small><strong>{program.beneficiaries || "Not specified"}</strong></div>
                            <div><small>Operating units</small><strong>{program.units || "Not specified"}</strong></div>
                            <div><small>Workflow progress</small><strong>{getActivityProgress(selectedActivity)}%</strong></div>
                          </div>
                          <label>
                            Activity design
                            <textarea
                              value={selectedActivity.activityDesign ?? ""}
                              disabled={!canEdit}
                              onChange={(event) => setActivities((current) => current.map((activity) => activity.id === selectedActivity.id ? { ...activity, activityDesign: event.target.value } : activity))}
                              placeholder="Describe the activity design, approach, beneficiaries, outputs, and implementation arrangements."
                              rows={12}
                            />
                          </label>
                          {canEdit && <div className="activity-status-actions"><button className="button primary" onClick={saveActivityDesign}><Save size={14} /> Save design</button></div>}
                        </div>
                        )}
                      </dialog>
                      {pendingTimelineStep && (
                        <div className="dialog-overlay confirmation-overlay">
                          <dialog open className="activity-dialog confirmation-dialog" aria-labelledby="workflow-confirmation-title">
                            <p className="eyebrow">Confirm workflow update</p>
                            <h2 id="workflow-confirmation-title">{pendingTimelineStep.shouldComplete ? "Mark sub-step complete?" : "Unmark sub-step?"}</h2>
                            <p className="confirmation-message">
                              {pendingTimelineStep.shouldComplete ? "Mark" : "Unmark"} <strong>{pendingTimelineStep.subStep}</strong> under <strong>{pendingTimelineStep.stepTitle}</strong>?
                            </p>
                            <div className="confirmation-actions">
                              <button className="button secondary" onClick={() => setPendingTimelineStep(null)}>Cancel</button>
                              <button className="button primary" onClick={confirmTimelineStepChange}>Confirm</button>
                            </div>
                          </dialog>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {activeTab === "settings" && (isAdmin || canEdit) && (
                <div className="settings-panel">
                  <div className="section-title">
                    <div>
                      <p className="eyebrow">Administration</p>
                      <h2>{settingsSection === "programs" ? "Program management" : "Program settings"}</h2>
                      <p>{settingsSection === "programs" ? "Create programs, open their workspaces, and manage program details." : "Manage the program workflow and review database records where permitted."}</p>
                    </div>
                  </div>
                  <div className="settings-switcher">
                    {systemRole === "superadmin" && <button className={settingsSection === "programs" ? "settings-switch active" : "settings-switch"} onClick={() => setSettingsSection("programs")}><ClipboardList size={13} /> Programs</button>}
                    <button className={settingsSection === "fund-workflow" ? "settings-switch active" : "settings-switch"} onClick={() => setSettingsSection("fund-workflow")}>Fund workflow</button>
                    {isAdmin && <button className={settingsSection === "audit" ? "settings-switch active" : "settings-switch"} onClick={() => setSettingsSection("audit")}>Audit log</button>}
                    {systemRole === "superadmin" && <button className={settingsSection === "database" ? "settings-switch active" : "settings-switch"} onClick={() => { setSettingsSection("database"); void loadDatabaseBrowser(); }}>Database</button>}
                  </div>
                  {settingsSection === "programs" && systemRole === "superadmin" ? (
                    <div className="programs-page settings-programs-page">
                      <div className="section-title"><div><p className="eyebrow">Superadmin workspace</p><h2>All programs</h2><p>Select a program to open its workspace or manage its settings.</p></div><button className="button primary" onClick={() => setShowProgramCreateDialog(true)}><Plus size={15} /> Create program</button></div>
                      <div className="programs-list">
                        {programOptions.map((item) => <div className={`program-list-entry ${item.id === program.id ? "selected" : ""}`} key={item.id}>
                          <button className="program-list-row" onClick={() => openProgramWorkspace(item.id)} aria-label={`Open ${item.acronym} finance and program workspace`}><span className="program-list-mark">{item.acronym.slice(0, 2)}</span><span><strong>{item.title}</strong><small>{item.acronym} · {item.agency}</small></span><span className="program-list-count">{(activitiesByProgram[item.id] ?? []).length} activities</span><span className="program-row-open-label">Open workspace</span><ChevronDown size={18} /></button>
                          <button className="button secondary program-list-details" onClick={() => { selectProgram(item.id); setProgramDialogEditing(false); setProgramDialogTab("details"); setShowProgramDetailDialog(true); }}><Settings size={14} /> Settings</button>
                        </div>)}
                        {programOptions.length === 0 && <div className="empty-state">No programs are available yet.</div>}
                      </div>
                    </div>
                  ) : settingsSection === "database" && systemRole === "superadmin" ? (
                    <div className="database-browser">
                      <div className="database-browser-header">
                        <div><p className="eyebrow">Read-only inspection</p><h2>Database contents</h2><p>Browse application records without editing or exposing credentials.</p></div>
                        <button className="button secondary" onClick={() => void loadDatabaseBrowser()} disabled={databaseLoading}>{databaseLoading ? "Refreshing..." : "Refresh"}</button>
                      </div>
                      <div className="database-browser-layout">
                        <nav className="database-table-list" aria-label="Database tables">
                          {Object.keys(databaseTables).map((tableName) => <button className={selectedDatabaseTable === tableName ? "database-table-button active" : "database-table-button"} key={tableName} onClick={() => setSelectedDatabaseTable(tableName)}>{tableName}<span>{databaseTables[tableName].length}</span></button>)}
                        </nav>
                        <section className="database-records">
                          <div className="database-records-heading"><strong>{selectedDatabaseTable}</strong><span>{databaseTables[selectedDatabaseTable]?.length ?? 0} records</span></div>
                          {databaseTables[selectedDatabaseTable]?.length ? <div className="database-record-list">{databaseTables[selectedDatabaseTable].map((record, index) => <details className="database-record" key={String(record.id ?? index)}><summary>Record {index + 1}{record.id ? ` · ${String(record.id)}` : ""}</summary><pre>{JSON.stringify(record, null, 2)}</pre></details>)}</div> : <div className="empty-state">No records found. Click Refresh to load the latest contents.</div>}
                        </section>
                      </div>
                    </div>
                  ) : settingsSection === "audit" && isAdmin ? (
                    <div className="audit-list">{auditLogs.length ? auditLogs.map((log) => <div className="audit-row" key={log.id}><strong>{log.action} {log.entity_type}</strong><span>{log.actor?.full_name ?? "System"}</span><small>{new Date(log.created_at).toLocaleString()}</small></div>) : <div className="empty-state">No audit events yet</div>}</div>
                  ) : (
                    <div className="workflow-editor">
                      <div className="section-title">
                        <div>
                          <h2>Operational & fund workflow</h2>
                          <p>Manage the workflow for {program.acronym}. Program changes are saved only to this program and do not change other programs.</p>
                        </div>
                        {isAdmin && <button className="button secondary" onClick={addStep}><Plus size={16} /> Add step</button>}
                      </div>
                      <div className="workflow-list">
                        {steps.map((step, index) => (
                          <button
                            key={step.id}
                            className={`workflow-row ${selectedId === step.id ? "selected" : ""} ${!step.active ? "inactive" : ""}`}
                            onClick={() => {
                              setSelectedId(step.id);
                              setStepDialogEditing(canEdit);
                              setShowStepDialog(true);
                            }}
                          >
                            <GripVertical size={17} className="drag-icon" />
                            <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                            <span className="row-content">
                              <strong>{step.title}</strong>
                              <small>{step.assignedRole} <span>•</span> {step.slaDays} days SLA <span>•</span> {step.subSteps?.length ?? 0} sub-steps</small>
                            </span>
                            <ChevronDown size={17} className="row-chevron" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {activeTab !== "activities" && activeTab !== "calendar" && activeTab !== "beneficiaries" && <aside className="preview-column">
              <div className="preview-heading">
                <div>
                  <p className="eyebrow">Live preview</p>
                  <h2>Program workspace</h2>
                </div>
                <span className="active-pill">
                  <span /> Active
                </span>
              </div>
              <div className="preview-card">
                <div className="preview-banner">
                  <div className="preview-agency">
                    <div className="preview-logo">
                      {program.logo ? (
                        <img src={program.logo} alt="" />
                      ) : (
                        <ShieldCheck size={19} />
                      )}
                    </div>
                    <div>
                      <strong>{program.agency}</strong>
                      <small>{program.office}</small>
                    </div>
                  </div>
                  <span className="acronym-badge">{program.acronym}</span>
                </div>
                <div className="preview-body">
                  <h3>{program.title}</h3>
                  <p>{program.description}</p>
                  <div className="preview-meta">
                    <span>
                      <Users size={14} /> {program.beneficiaries.split(",")[0]}
                    </span>
                    <span>
                      <ClipboardList size={14} /> {activeSteps.length} workflow
                      stages
                    </span>
                  </div>
                  <div className="preview-divider" />
                  <div className="tracker-heading">
                    <strong>Application progress</strong>
                    <span>Step 2 of {activeSteps.length}</span>
                  </div>
                  <div className="progress-track">
                    {activeSteps.map((step) => (
                      <span
                        key={step.id}
                        className={
                          step.status === "Completed"
                            ? "done"
                            : step.id === selectedId
                              ? "current"
                              : ""
                        }
                        style={{
                          backgroundColor:
                            step.status === "Completed"
                              ? program.primary
                              : step.id === selectedId
                                ? program.accent
                                : undefined,
                        }}
                      />
                    ))}
                  </div>
                  <div className="tracker-list">
                    {activeSteps.map((step, index) => (
                      <div key={step.id} className="tracker-item">
                        <div
                          className={`tracker-dot ${step.status === "Completed" ? "done" : step.id === selectedId ? "current" : ""}`}
                          style={
                            step.status === "Completed" ||
                            step.id === selectedId
                              ? {
                                  borderColor:
                                    step.id === selectedId
                                      ? program.accent
                                      : program.primary,
                                  color:
                                    step.id === selectedId
                                      ? program.accent
                                      : program.primary,
                                }
                              : undefined
                          }
                        >
                          {step.status === "Completed" ? (
                            <Check size={12} />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div>
                          <strong>{step.title}</strong>
                          <small>
                            {step.status === "Completed"
                              ? "Completed"
                              : step.id === selectedId
                                ? "In progress"
                                : `Up next · ${step.slaDays} days`}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="tip-card">
                <div className="tip-icon">
                  <FileText size={17} />
                </div>
                <div>
                  <strong>Keep your workflow clear</strong>
                  <p>
                    Short steps and named owners help field teams move
                    applications forward with confidence.
                  </p>
                </div>
              </div>
            </aside>}
          </div>)}

          {activeTab === "dashboard" && dashboardChartMetric && (
            <div className="dialog-overlay dashboard-chart-overlay" onClick={(event) => { if (event.target === event.currentTarget) setDashboardChartMetric(null); }}>
              <dialog open className="activity-dialog dashboard-chart-dialog" aria-labelledby="dashboard-chart-title">
                <div className="detail-heading">
                  <div>
                    <p className="eyebrow">{dashboardScopeLabel} · FY {dashboardYear}</p>
                    <h2 id="dashboard-chart-title">{dashboardChartTitles[dashboardChartMetric].title}</h2>
                    <p className="detail-subtitle">Financial charts use the selected program and fiscal year; activity charts also follow the activity-status filter.</p>
                  </div>
                  <button className="icon-button" aria-label="Close chart" onClick={() => setDashboardChartMetric(null)}><X size={17} /></button>
                </div>
                <div className="dashboard-chart-dialog-actions">
                  <button className="button secondary" onClick={() => downloadDashboardChart("csv")}><Download size={15} /> Export data (CSV)</button>
                  <button className="button secondary" onClick={() => downloadDashboardChart("svg")}><Download size={15} /> Export chart (SVG)</button>
                </div>
                {dashboardChartData.length ? <>
                  <div className="dashboard-dialog-chart" aria-label={`${dashboardChartTitles[dashboardChartMetric].title} bar chart`}>
                    {dashboardChartData.map((row) => {
                      const maxValue = Math.max(1, ...dashboardChartData.map((item) => item.value));
                      const valueLabel = dashboardChartTitles[dashboardChartMetric].unit === "currency" ? formatDashboardCurrency(row.value) : row.value.toLocaleString();
                      return <button type="button" className="dashboard-dialog-chart-row" key={row.label} title={systemRole === "superadmin" && dashboardProgramFilter === "all" ? `Filter dashboard to ${row.label}` : row.label} onClick={() => {
                        if (systemRole !== "superadmin" || dashboardProgramFilter !== "all") return;
                        const selectedProgram = programOptions.find((item) => item.acronym === row.label);
                        if (selectedProgram) setDashboardProgramFilter(selectedProgram.id);
                      }}>
                        <span title={row.label}>{row.label}</span>
                        <span className="dashboard-dialog-chart-track"><i style={{ width: `${row.value > 0 ? Math.max(1, row.value / maxValue * 100) : 0}%` }} /></span>
                        <b>{valueLabel}</b>
                      </button>;
                    })}
                  </div>
                </> : <div className="empty-state">No chart data is available for the selected filters.</div>}
                {["totalActivities", "completedActivities", "notCompletedActivities", "overdueActivities", "activityBudget", "obligations"].includes(dashboardChartMetric) && (
                  <section className="dashboard-drilldown" aria-label="Activities included in this chart">
                    <div className="dashboard-drilldown-heading">
                      <div><h3>Activities included</h3><p>{dashboardChartActivities.length} matching activities · Select a row to open its details.</p></div>
                    </div>
                    {dashboardChartActivities.length ? <div className="dashboard-drilldown-list">
                      {dashboardChartActivities.map((activity) => {
                        const activityProgram = programOptions.find((item) => item.id === activity.programId);
                        const progress = getDashboardActivityProgress(activity);
                        return <button type="button" className="dashboard-drilldown-row" key={`${activity.programId ?? ""}:${activity.id}`} onClick={() => openDashboardActivity(activity)}>
                          <span className="dashboard-drilldown-main"><strong>{activity.name}</strong>                                                    <small>{activity.location || "No location"} · {formatActivitySchedule(activity)}{systemRole === "superadmin" ? ` · ${activityProgram?.acronym ?? "Program"}` : ""}</small></span>
                          <span className="dashboard-drilldown-status">{activity.status}</span>
                          <span className="dashboard-drilldown-finance"><small>Budget</small><b>{formatDashboardCurrency(activity.budget)}</b></span>
                          <span className="dashboard-drilldown-finance"><small>Obligations</small><b>{formatDashboardCurrency(activity.spent)}</b></span>
                          <span className="dashboard-drilldown-progress"><small>{progress}% complete</small><span><i style={{ width: `${progress}%` }} /></span></span>
                        </button>;
                      })}
                    </div> : <div className="empty-state">No activities match this card and the selected filters.</div>}
                  </section>
                )}
              </dialog>
            </div>
          )}
          {activeTab === "dashboard" && dashboardStatusDialog && (
            <div className="dialog-overlay dashboard-chart-overlay" onClick={(event) => { if (event.target === event.currentTarget) setDashboardStatusDialog(null); }}>
              <dialog open className="activity-dialog dashboard-chart-dialog dashboard-status-dialog" aria-labelledby="dashboard-status-dialog-title">
                <div className="detail-heading">
                  <div>
                    <p className="eyebrow">{dashboardScopeLabel} · FY {dashboardYear}</p>
                    <h2 id="dashboard-status-dialog-title">{dashboardStatusDialog} activities</h2>
                    <p className="detail-subtitle">{dashboardStatusDialogActivities.length} activities with this status. Select one to view its details.</p>
                  </div>
                  <button className="icon-button" aria-label="Close activity status dialog" onClick={() => setDashboardStatusDialog(null)}><X size={17} /></button>
                </div>
                {dashboardStatusDialogActivities.length ? <div className="dashboard-drilldown-list">
                  {dashboardStatusDialogActivities.map((activity) => {
                    const activityProgram = programOptions.find((item) => item.id === activity.programId);
                    const progress = getDashboardActivityProgress(activity);
                    return <button type="button" className="dashboard-drilldown-row" key={`${activity.programId ?? ""}:${activity.id}`} onClick={() => openDashboardActivity(activity)}>
                      <span className="dashboard-drilldown-main"><strong>{activity.name}</strong><small>{activity.location || "No location"} · {formatActivitySchedule(activity)}{systemRole === "superadmin" ? ` · ${activityProgram?.acronym ?? "Program"}` : ""}</small></span>
                      <span className="dashboard-drilldown-status">{activity.status}</span>
                      <span className="dashboard-drilldown-finance"><small>Budget</small><b>{formatDashboardCurrency(activity.budget)}</b></span>
                      <span className="dashboard-drilldown-finance"><small>Obligations</small><b>{formatDashboardCurrency(activity.spent)}</b></span>
                      <span className="dashboard-drilldown-progress"><small>{progress}% complete</small><span><i style={{ width: `${progress}%` }} /></span></span>
                    </button>;
                  })}
                </div> : <div className="empty-state">No {dashboardStatusDialog.toLowerCase()} activities match this program and fiscal year.</div>}
              </dialog>
            </div>
          )}
          {activeTab === "dashboard" && dashboardActivityDialogTarget && showActivityDialog && (
            <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setSelectedActivityId(""); setDashboardActivityDialogTarget(null); setShowActivityDialog(false); }}>
              <dialog open className="activity-detail activity-dialog dashboard-activity-dialog">
                <div className="detail-heading">
                  <div>
                    <p className="eyebrow">{systemRole === "superadmin" ? `${programOptions.find((item) => item.id === dashboardActivityDialogTarget.programId)?.acronym ?? "Program"} · Activity overview` : "Activity overview"}</p>
                    <h2>{dashboardActivityDialogTarget.name}</h2>
                    <p className="detail-subtitle">{dashboardActivityDialogTarget.location || "No location"} · {formatActivitySchedule(dashboardActivityDialogTarget)}</p>
                  </div>
                  <button className="icon-button" aria-label="Close activity" onClick={() => { setSelectedActivityId(""); setDashboardActivityDialogTarget(null); setShowActivityDialog(false); }}><X size={17} /></button>
                </div>
                <div className="fund-summary">
                  <div><small>Status</small><strong>{dashboardActivityDialogTarget.status}</strong></div>
                  <div><small>Approved budget</small><strong>{formatDashboardCurrency(dashboardActivityDialogTarget.budget)}</strong></div>
                  <div><small>Obligations</small><strong>{formatDashboardCurrency(dashboardActivityDialogTarget.spent)}</strong></div>
                </div>
                <div className="dashboard-activity-meta"><span>Current workflow step</span><strong>{getNumberedStep(dashboardActivityDialogSteps, dashboardActivityDialogTarget.currentStep)}</strong>{dashboardActivityDialogTarget.currentSubStep && <><span>Current sub-step</span><strong>{(dashboardActivityDialogActiveSteps.findIndex((step) => step.title === dashboardActivityDialogTarget.currentStep) + 1)}.{(dashboardActivityDialogCurrentStep?.subSteps ?? []).indexOf(dashboardActivityDialogTarget.currentSubStep) + 1} {dashboardActivityDialogTarget.currentSubStep}</strong></>}</div>
              </dialog>
            </div>
          )}

          {showProgramCreateDialog && (
            <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setShowProgramCreateDialog(false); }}>
              <dialog open className="activity-dialog program-create-dialog">
                <div className="detail-heading"><div><p className="eyebrow">Superadmin workspace</p><h2>Create program</h2><p className="detail-subtitle">Add the program details first, then assign its administrator from the program details dialog.</p></div><button className="icon-button" aria-label="Close create program dialog" onClick={() => setShowProgramCreateDialog(false)}><X size={17} /></button></div>
                        <div className="program-create-grid"><input value={programForm.title} onChange={(event) => { setProgramForm({ ...programForm, title: event.target.value }); setProgramCreateError(""); }} placeholder="Program name" /><input value={programForm.acronym} onChange={(event) => { setProgramForm({ ...programForm, acronym: event.target.value }); setProgramCreateError(""); }} placeholder="Acronym" /><input value={programForm.agency} onChange={(event) => setProgramForm({ ...programForm, agency: event.target.value })} placeholder="Agency" /><input value={programForm.office} onChange={(event) => setProgramForm({ ...programForm, office: event.target.value })} placeholder="Office / subtitle" /><input value={programForm.beneficiaries} onChange={(event) => setProgramForm({ ...programForm, beneficiaries: event.target.value })} placeholder="Target beneficiaries" /><input value={programForm.units} onChange={(event) => setProgramForm({ ...programForm, units: event.target.value })} placeholder="Operating units" /><textarea value={programForm.description} onChange={(event) => setProgramForm({ ...programForm, description: event.target.value })} placeholder="Program description" rows={3} />{programCreateError && <p className="program-create-error" role="alert">{programCreateError}</p>}<button className="button primary" onClick={() => void createProgramForSuperadmin()}><Plus size={15} /> Create program</button></div>
              </dialog>
            </div>
          )}

          {memberDialog && (
            <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setMemberDialog(null); }}>
              <dialog open className="activity-dialog account-dialog">
                <div className="detail-heading"><div><p className="eyebrow">{program.acronym} account</p><h2>Edit account</h2><p className="detail-subtitle">Update the user name or program role.</p></div><button className="icon-button" aria-label="Close account editor" onClick={() => setMemberDialog(null)}><X size={17} /></button></div>
                <div className="account-dialog-form"><label>Full name<input value={accountForm.fullName} onChange={(event) => setAccountForm({ ...accountForm, fullName: event.target.value })} /></label><label>Email<input value={accountForm.email} disabled /></label><label>Role<select value={accountForm.role === "program_admin" ? "program_admin" : "viewer"} disabled={systemRole !== "superadmin"} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value as "program_admin" | "viewer" })}><option value="program_admin">Program admin</option><option value="viewer">Viewer</option></select></label><button className="button primary" onClick={() => void updateMemberAccount()}><Save size={14} /> Save account</button></div>
              </dialog>
            </div>
          )}

          {activeTab === "settings" && settingsSection === "fund-workflow" && selectedStep && showStepDialog && (
            <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setSelectedId(""); setShowStepDialog(false); setStepDialogEditing(false); }}>
            <dialog open className="step-detail step-dialog">
              <div className="detail-heading">
                <div>
                  <p className="eyebrow">
                    Editing step{" "}
                    {String(
                      steps.findIndex((step) => step.id === selectedId) + 1,
                    ).padStart(2, "0")}
                  </p>
                  <h2>{selectedStep.title}</h2>
                </div>
                <div className="detail-actions">
                  {!stepDialogEditing && canEdit && <button className="button secondary" onClick={() => setStepDialogEditing(true)}>Edit step</button>}
                  {stepDialogEditing && <button className="button primary" onClick={saveStepChanges}><Save size={14} /> Save step</button>}
                  {canEdit && <button
                    className="icon-button"
                    onClick={() => moveStep(-1)}
                    aria-label="Move step up"
                  >
                    <ArrowUp size={17} />
                  </button>}
                  {canEdit && <button
                    className="icon-button"
                    onClick={() => moveStep(1)}
                    aria-label="Move step down"
                  >
                    <ArrowDown size={17} />
                  </button>}
                  {canEdit && <button
                    className="icon-button danger"
                    onClick={() => updateStep("active", false)}
                    aria-label="Archive step"
                  >
                    <Trash2 size={17} />
                  </button>}
                  <button
                    className="icon-button"
                    onClick={() => { setSelectedId(""); setShowStepDialog(false); setStepDialogEditing(false); }}
                    aria-label="Close editor"
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
              <div className="detail-grid">
                <label>
                  Step name
                  <input
                    value={selectedStep.title}
                    disabled={!stepDialogEditing}
                    onChange={(e) => updateStep("title", e.target.value)}
                  />
                </label>
                <label>
                  Assigned unit / responsible role
                  <input
                    value={selectedStep.assignedRole}
                    disabled={!stepDialogEditing}
                    onChange={(e) => updateStep("assignedRole", e.target.value)}
                  />
                </label>
                <label className="wide">
                  Description / instructions
                  <textarea
                    value={selectedStep.description}
                    disabled={!stepDialogEditing}
                    onChange={(e) => updateStep("description", e.target.value)}
                    rows={3}
                  />
                </label>
                <label>
                  Required attachments / forms
                  <input
                    value={selectedStep.requiredDocuments}
                    disabled={!stepDialogEditing}
                    onChange={(e) =>
                      updateStep("requiredDocuments", e.target.value)
                    }
                  />
                </label>
                <label>
                  Target SLA <span className="label-muted">(days)</span>
                  <input
                    type="number"
                    min={1}
                    value={selectedStep.slaDays}
                    disabled={!stepDialogEditing}
                    onChange={(e) =>
                      updateStep("slaDays", Number(e.target.value))
                    }
                  />
                </label>
                <label className="wide substeps-field">
                  <span>Sub-steps <span className="label-muted">(numbered automatically)</span></span>
                  <div className="substeps-editor">
                    {(selectedStep.subSteps ?? []).map((subStep, index) => (
                      <div className="substep-editor-row" key={`${selectedStep.id}-${index}`}>
                        <span className="substep-number">{activeSteps.findIndex((step) => step.id === selectedStep.id) + 1}.{index + 1}</span>
                        <input
                          value={subStep}
                          disabled={!stepDialogEditing}
                          onChange={(event) => updateSubStep(index, event.target.value)}
                          placeholder="Describe this task"
                        />
                        <button
                          className="icon-button danger"
                          type="button"
                          aria-label={`Remove substep ${index + 1}`}
                          disabled={!stepDialogEditing}
                          onClick={() => removeSubStep(index)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <button className="button secondary add-substep" type="button" disabled={!stepDialogEditing} onClick={addSubStep}>
                      <Plus size={15} /> Add substep
                    </button>
                  </div>
                </label>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={selectedStep.isOptional}
                    disabled={!stepDialogEditing}
                    onChange={(e) => updateStep("isOptional", e.target.checked)}
                  />
                  <span className="switch" /> Optional workflow step
                </label>
              </div>
            </dialog>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
