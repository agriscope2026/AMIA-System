import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  ClipboardList,
  CircleDollarSign,
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
import { createActivity as createDatabaseActivity, createManagedUser, createProgram, createWorkflowStep, databaseConfigured, deleteActivity as deleteDatabaseActivity, deleteAnnualAllocation, deleteProcurementItem, getAuthSession, loadActivities, loadAdminDatabaseTables, loadAnnualAllocations, loadAuditLogs, loadMembers, loadProcurementItems, loadPrograms, loadProfile, loadWorkflowSteps, manageProgramUser, reorderWorkflowSteps, saveAnnualAllocation, saveProcurementItem, signIn, signOut, subscribeToAuth, updateActivity as updateDatabaseActivity, updateProgram as updateDatabaseProgram, updateWorkflowStep } from "./lib/database";
import type { AnnualProgramAllocation, AppProfile, AuditLog, ProcurementItem, ProgramMember } from "./lib/database";

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
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  activityDesign?: string;
  status: string;
  currentStep: string;
  currentSubStep?: string;
  stepRemarks?: Record<string, string>;
  completedSubSteps?: Record<string, string[]>;
};

type ProcurementDraft = Omit<ProcurementItem, "id" | "program_id" | "activity_id">;

const createEmptyAllocationDraft = () => ({
  fund_source: "General Appropriations Act (GAA)",
  allotment_reference: "",
  obligation_reference: "",
  disbursement_reference: "",
  appropriation: "",
  allotment_received: "",
  obligations: "",
  disbursements: "",
  accounts_payable: "",
  cash_advances: "",
  liquidation: "",
  savings: "",
  remarks: "",
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

const mapDatabaseActivity = (activity: import("./lib/database").DatabaseActivity, steps: WorkflowStep[]): Activity => ({
  id: activity.id,
  name: activity.title,
  location: activity.location ?? "",
  startDate: activity.start_date,
  endDate: activity.target_end_date ?? "",
  budget: Number(activity.approved_budget),
  spent: Number(activity.recorded_spending),
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
  const [expandedTimelineSteps, setExpandedTimelineSteps] = useState<Record<string, boolean>>({});
  const [pendingTimelineStep, setPendingTimelineStep] = useState<{ stepTitle: string; subStep: string; shouldComplete: boolean } | null>(null);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [session, setSession] = useState<Awaited<ReturnType<typeof getAuthSession>>>(null);
  const [authReady, setAuthReady] = useState(!databaseConfigured);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<{ userId: string; message: string } | null>(null);
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
    "dashboard" | "programs" | "details" | "workflow" | "activities" | "settings" | "finance"
  >("dashboard");
  const [settingsSection, setSettingsSection] = useState<"fund-workflow" | "audit" | "database">("fund-workflow");
  const [activityView] = useState<"timeline" | "table">("table");
  const [activitySearch, setActivitySearch] = useState("");
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
  const [allocationSaving, setAllocationSaving] = useState(false);
  const [editingAllocationId, setEditingAllocationId] = useState<string | null>(null);
  const [showAllocationForm, setShowAllocationForm] = useState(false);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(new Date().getFullYear());
  const [allocationDraft, setAllocationDraft] = useState(createEmptyAllocationDraft);
  const [procurementItems, setProcurementItems] = useState<ProcurementItem[]>([]);
  const [editingProcurementItemId, setEditingProcurementItemId] = useState<string | null>(null);
  const [procurementLoadedActivityId, setProcurementLoadedActivityId] = useState<string | null>(null);
  const [procurementDraft, setProcurementDraft] = useState<ProcurementDraft>({
    category: "Food and catering",
    item_description: "",
    supplier_name: "",
    procurement_method: "Small Value Procurement",
    purchase_order_number: "",
    quantity: 1,
    unit: "lot",
    unit_cost: 0,
    delivery_status: "For procurement",
    delivery_date: null,
  });
  const activeSteps = useMemo(
    () => steps.filter((step) => step.active),
    [steps],
  );
  const selectedStep = steps.find((step) => step.id === selectedId) ?? steps[0];
  const today = new Date().toISOString().slice(0, 10);
  const dashboardActivityMap = useMemo(() => ({ ...activitiesByProgram, [program.id]: activities }), [activities, activitiesByProgram, program.id]);
  const dashboardActivities = systemRole === "superadmin" ? Object.values(dashboardActivityMap).flat() : activities;
  const dashboardTotals = useMemo(() => ({
    activities: dashboardActivities.length,
    budget: dashboardActivities.reduce((total, activity) => total + activity.budget, 0),
    spent: dashboardActivities.reduce((total, activity) => total + activity.spent, 0),
    overdue: dashboardActivities.filter((activity) => activity.endDate < today && activity.status !== "Completed").length,
  }), [dashboardActivities, today]);
  const dashboardProgramCount = systemRole === "superadmin" ? programOptions.length : 1;
  const dashboardStatusSummary = useMemo(() => {
    const counts = new Map<string, number>();
    dashboardActivities.forEach((activity) => counts.set(activity.status, (counts.get(activity.status) ?? 0) + 1));
    return Array.from(counts, ([label, count]) => ({ label, count, className: label === "Completed" ? "status-completed" : "status-progress" }));
  }, [dashboardActivities]);
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
      setProfileLoadError(null);
    }).catch((error: unknown) => {
      if (!currentRequest) return;
      setProfile({ id: session.user.id, full_name: session.user.email ?? "User", email: session.user.email ?? "" });
      setSystemRole("user");
      setProfileLoadError({
        userId: session.user.id,
        message: error instanceof Error ? error.message : "Could not load your account role",
      });
    });
    return () => { currentRequest = false; };
  }, [session]);

  useEffect(() => {
    if (!databaseConfigured || !session?.user || !program.id) return;
    void loadMembers(program.id).then((loadedMembers) => {
      setMembers(loadedMembers);
      setProgramRole(loadedMembers.find((member) => member.user_id === session.user.id)?.role ?? "viewer");
    }).catch((error: unknown) => {
      setMembers([]);
      setProgramRole("viewer");
      setNotice(error instanceof Error
        ? `Could not load program permissions: ${error.message}`
        : "Could not load program permissions");
    });
    void loadAuditLogs(program.id).then(setAuditLogs).catch(() => setAuditLogs([]));
  }, [program.id, session]);

  useEffect(() => {
    if (!databaseConfigured || !program.id || activeTab !== "finance") return;
    void loadAnnualAllocations(program.id).then(setAnnualAllocations).catch((error: unknown) => {
      setNotice(error instanceof Error ? `Could not load annual allocations: ${error.message}` : "Could not load annual allocations");
    });
  }, [activeTab, program.id]);

  useEffect(() => {
    if (!databaseConfigured || !showActivityDialog || !selectedActivityId) return;
    let currentRequest = true;
    void loadProcurementItems(selectedActivityId).then((items) => {
      if (!currentRequest) return;
      setProcurementItems(items);
      setProcurementLoadedActivityId(selectedActivityId);
    }).catch((error: unknown) => {
      if (!currentRequest) return;
      setNotice(error instanceof Error ? `Could not load procurement items: ${error.message}` : "Could not load procurement items");
      setProcurementItems([]);
      setProcurementLoadedActivityId(selectedActivityId);
    });
    return () => { currentRequest = false; };
  }, [selectedActivityId, showActivityDialog]);

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
          setNotice("No programs are seeded in the online database");
          return;
        }
        const options = await Promise.all(records.map(async (record) => {
          const recordsSteps = await loadWorkflowSteps(record.id);
          return mapDatabaseProgram(record, recordsSteps.map(mapDatabaseStep));
        }));
        const recordsByProgram = await Promise.all(records.map(async (record) => [record.id, (await loadActivities(record.id)).map((activity) => activity)] as const));
        const first = options[0];
        const firstActivities = recordsByProgram.find(([id]) => id === first.id)?.[1] ?? [];
        if (!mounted) return;
        setProgramOptions(options);
        setProgram(first);
        setSteps(first.steps);
        setActivities(firstActivities.map((activity) => mapDatabaseActivity(activity, first.steps)));
        setActivitiesByProgram(Object.fromEntries(recordsByProgram.map(([id, records]) => [id, records.map((activity) => mapDatabaseActivity(activity, options.find((option) => option.id === id)?.steps ?? []))])));
        setSelectedId(first.steps[0]?.id ?? "");
        setSelectedActivityId(firstActivities[0]?.id ?? "");
        setNotice("Loaded from database");
      } catch (error) {
        if (mounted) setNotice(error instanceof Error ? `Database unavailable: ${error.message}` : "Database unavailable");
        console.error(error);
      }
    };
    void hydrateFromDatabase();
    return () => { mounted = false; };
  }, [session]);

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
    setAnnualAllocations([]);
    if (databaseConfigured) {
      void (async () => {
        try {
          const recordsSteps = (await loadWorkflowSteps(id)).map(mapDatabaseStep);
          const recordsActivities = await loadActivities(id);
          const databaseProgram = { ...nextProgram, steps: recordsSteps };
          setProgram(databaseProgram);
          setSteps(recordsSteps);
          setActivities(recordsActivities.map((activity) => mapDatabaseActivity(activity, recordsSteps)));
          setSelectedId(recordsSteps[0]?.id ?? "");
          setSelectedActivityId(recordsActivities[0]?.id ?? "");
          setActivitiesByProgram((current) => ({
            ...current,
            [id]: recordsActivities.map((activity) => mapDatabaseActivity(activity, recordsSteps)),
          }));
          setNotice(`${databaseProgram.acronym} workspace opened`);
          return;
        } catch (error) {
          console.error(error);
          setNotice("Could not load the selected program");
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
    if (!newActivity.name.trim()) {
      setNotice("Activity name is required");
      return;
    }
    if (!newActivity.startDate) {
      setNotice("Activity start date is required");
      return;
    }
    if (newActivity.endDate && newActivity.endDate < newActivity.startDate) {
      setNotice("Target end date must be after the start date");
      return;
    }
    if (!activeSteps.length) {
      setNotice("Add at least one workflow step before creating an activity");
      return;
    }
    const budget = Number(newActivity.budget) || 0;
    const spent = Number(newActivity.spent) || 0;
    if (budget < 0 || spent < 0 || spent > budget) {
      setNotice("Spending must be between zero and the approved budget");
      return;
    }
    const activity: Activity = {
      id: `${program.id}-act-${Date.now()}`,
      name: newActivity.name.trim(),
      location: newActivity.location || "Regional activity",
      startDate: newActivity.startDate,
      endDate: newActivity.endDate,
      budget,
      spent,
      activityDesign: newActivity.activityDesign.trim(),
      status: getActivityStatus(steps, newActivity.currentStep || steps[0]?.title || "Activity Planning", newActivity.currentSubStep || ""),
      currentStep: newActivity.currentStep || steps[0]?.title || "Activity Planning",
      currentSubStep: newActivity.currentSubStep || steps.find((step) => step.title === (newActivity.currentStep || steps[0]?.title))?.subSteps?.[0] || "",
      stepRemarks: editingActivityId ? activities.find((item) => item.id === editingActivityId)?.stepRemarks ?? {} : {},
    };
    try {
      const currentStepId = steps.find((step) => step.title === activity.currentStep)?.id ?? null;
      const databaseValues = {
        title: activity.name,
        location: activity.location,
        start_date: activity.startDate,
        target_end_date: activity.endDate,
        approved_budget: activity.budget,
        recorded_spending: activity.spent,
        status: activity.status,
        current_step_id: currentStepId,
        current_sub_step: activity.currentSubStep ?? null,
        step_remarks: activity.stepRemarks ?? {},
        activity_design: activity.activityDesign ?? "",
        completed_sub_steps: activity.completedSubSteps ?? {},
      };
      if (editingActivityId) {
        await updateDatabaseActivity(editingActivityId, databaseValues);
        setActivities((current) => current.map((item) => item.id === editingActivityId ? { ...activity, id: editingActivityId } : item));
        setSelectedActivityId(editingActivityId);
        setNotice("Activity updated in the online database");
      } else {
        const created = await createDatabaseActivity({ program_id: program.id, activity_code: `ACT-${Date.now()}`, ...databaseValues });
        const savedActivity = mapDatabaseActivity(created, steps);
        setActivities((current) => [savedActivity, ...current]);
        setActivitiesByProgram((current) => ({ ...current, [program.id]: [savedActivity, ...(current[program.id] ?? [])] }));
        setSelectedActivityId(created.id);
        setNotice("Activity saved to the online database");
      }
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
    setShowActivityForm(true);
  };
  const deleteActivity = async (id: string) => {
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
  const filteredActivities = activities.filter((activity) => {
    const query = activitySearch.trim().toLowerCase();
    if (!query) return true;
    return [activity.name, activity.location, activity.status, activity.currentStep]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const selectedActivityStep = steps.find((step) => step.title === selectedActivity?.currentStep);
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
  const saveAllocation = async () => {
    const appropriation = Number(allocationDraft.appropriation) || 0;
    const allotment_received = Number(allocationDraft.allotment_received) || 0;
    const obligations = Number(allocationDraft.obligations) || 0;
    const disbursements = Number(allocationDraft.disbursements) || 0;
    const supplementalAmounts = [allocationDraft.accounts_payable, allocationDraft.cash_advances, allocationDraft.liquidation, allocationDraft.savings].map((value) => Number(value) || 0);
    if (!allocationDraft.fund_source.trim() || [appropriation, allotment_received, obligations, disbursements, ...supplementalAmounts].some((amount) => !Number.isFinite(amount) || amount < 0)) {
      setNotice("Enter a fund source and non-negative financial amounts");
      return;
    }
    if (allotment_received > appropriation || obligations > allotment_received || disbursements > obligations) {
      setNotice("Check the financial ceilings: allotments cannot exceed appropriation, obligations cannot exceed allotment, and disbursements cannot exceed obligations");
      return;
    }
    setAllocationSaving(true);
    try {
      const savedAllocation = await saveAnnualAllocation({
        id: editingAllocationId ?? undefined,
        program_id: program.id,
        fiscal_year: selectedFiscalYear,
        fund_source: allocationDraft.fund_source.trim(),
        allotment_reference: allocationDraft.allotment_reference.trim() || null,
        obligation_reference: allocationDraft.obligation_reference.trim() || null,
        disbursement_reference: allocationDraft.disbursement_reference.trim() || null,
        appropriation,
        allotment_received,
        obligations,
        disbursements,
        accounts_payable: Number(allocationDraft.accounts_payable) || 0,
        cash_advances: Number(allocationDraft.cash_advances) || 0,
        liquidation: Number(allocationDraft.liquidation) || 0,
        savings: Number(allocationDraft.savings) || 0,
        remarks: allocationDraft.remarks.trim() || null,
      });
      setAnnualAllocations((current) => [...current.filter((row) => row.id !== savedAllocation.id), savedAllocation].sort((a, b) => b.fiscal_year - a.fiscal_year || a.fund_source.localeCompare(b.fund_source)));
      setEditingAllocationId(null);
      setAllocationDraft(createEmptyAllocationDraft());
      setShowAllocationForm(false);
      setNotice("Annual financial allocation saved to the database");
    } catch (error) {
      setNotice(`Annual allocation was not saved: ${getDatabaseErrorMessage(error)}`);
    } finally {
      setAllocationSaving(false);
    }
  };
  const removeAllocation = async (id: string) => {
    try {
      await deleteAnnualAllocation(id);
      setAnnualAllocations((current) => current.filter((row) => row.id !== id));
      setNotice("Annual allocation deleted");
    } catch (error) {
      setNotice(`Could not delete allocation: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const addProcurementItem = async () => {
    if (!selectedActivity || !procurementDraft.category.trim() || !procurementDraft.item_description.trim() || !procurementDraft.supplier_name.trim() || !procurementDraft.procurement_method.trim() || !procurementDraft.unit.trim()) {
      setNotice("Enter the category, item/service, supplier, procurement method, and unit");
      return;
    }
    if (!Number.isFinite(procurementDraft.quantity) || !Number.isFinite(procurementDraft.unit_cost) || procurementDraft.quantity <= 0 || procurementDraft.unit_cost < 0) {
      setNotice("Quantity must be greater than zero and unit cost cannot be negative");
      return;
    }
    try {
      const savedItem = await saveProcurementItem({
        id: editingProcurementItemId ?? undefined,
        ...procurementDraft,
        program_id: program.id,
        activity_id: selectedActivity.id,
        category: procurementDraft.category.trim(),
        item_description: procurementDraft.item_description.trim(),
        supplier_name: procurementDraft.supplier_name.trim(),
        procurement_method: procurementDraft.procurement_method.trim(),
        unit: procurementDraft.unit.trim(),
        purchase_order_number: procurementDraft.purchase_order_number?.trim() || null,
        delivery_date: procurementDraft.delivery_date || null,
      });
      setProcurementItems((current) => [...current.filter((item) => item.id !== savedItem.id), savedItem]);
      setEditingProcurementItemId(null);
      setProcurementDraft({ category: "Food and catering", item_description: "", supplier_name: "", procurement_method: "Small Value Procurement", purchase_order_number: "", quantity: 1, unit: "lot", unit_cost: 0, delivery_status: "For procurement", delivery_date: null });
      setNotice("Procurement item saved to the database");
    } catch (error) {
      setNotice(`Procurement item was not saved: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const removeProcurementItem = async (item: ProcurementItem) => {
    try {
      await deleteProcurementItem(item.id);
      setProcurementItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setNotice("Procurement item deleted");
    } catch (error) {
      setNotice(`Could not delete procurement item: ${getDatabaseErrorMessage(error)}`);
    }
  };
  const procurementPanel = selectedActivity ? (
    <div className="procurement-panel">
      <div className="procurement-heading">
        <div><p className="eyebrow">Activity procurement plan</p><h3>Suppliers, goods, and services</h3><p>Track a separate supplier for every category or purchase package.</p></div>
        <span className="procurement-total">₱{procurementItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost), 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      {procurementLoadedActivityId !== selectedActivity.id ? <div className="empty-state">Loading supplier records…</div> : procurementItems.length ? <div className="procurement-items">{procurementItems.map((item) => (
        <article className="procurement-item" key={item.id}>
          <div><span className="procurement-category">{item.category}</span><h4>{item.item_description}</h4><p>{item.supplier_name} · {item.procurement_method}</p><small>{item.purchase_order_number ? `PO ${item.purchase_order_number} · ` : ""}{item.delivery_status}{item.delivery_date ? ` · ${item.delivery_date}` : ""}</small></div>
          <div className="procurement-item-amount"><strong>₱{(Number(item.quantity) * Number(item.unit_cost)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>{Number(item.quantity).toLocaleString()} {item.unit} × ₱{Number(item.unit_cost).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small></div>
          {canEdit && <div className="finance-row-actions"><button className="button secondary" onClick={() => { setEditingProcurementItemId(item.id); setProcurementDraft({ category: item.category, item_description: item.item_description, supplier_name: item.supplier_name, procurement_method: item.procurement_method, purchase_order_number: item.purchase_order_number ?? "", quantity: Number(item.quantity), unit: item.unit, unit_cost: Number(item.unit_cost), delivery_status: item.delivery_status, delivery_date: item.delivery_date }); }}>Edit</button><button className="icon-button danger" aria-label={`Delete procurement item from ${item.supplier_name}`} onClick={() => void removeProcurementItem(item)}><Trash2 size={15} /></button></div>}
        </article>
      ))}</div> : <div className="empty-state">No procurement suppliers recorded for this activity.</div>}
      {canEdit && <section className="procurement-form">
        <h4>Add goods, services, or supplier</h4>
        <div className="procurement-form-grid">
          <label>Category<input list="procurement-categories" value={procurementDraft.category} onChange={(event) => setProcurementDraft({ ...procurementDraft, category: event.target.value })} /><datalist id="procurement-categories"><option value="Food and catering" /><option value="Venue and lodging" /><option value="Transport and freight" /><option value="Training and professional services" /><option value="Farm inputs and materials" /><option value="Equipment and supplies" /><option value="Other goods or services" /></datalist></label>
          <label>Item / service<input value={procurementDraft.item_description} onChange={(event) => setProcurementDraft({ ...procurementDraft, item_description: event.target.value })} placeholder="Describe the goods or service" /></label>
          <label>Supplier / service provider<input value={procurementDraft.supplier_name} onChange={(event) => setProcurementDraft({ ...procurementDraft, supplier_name: event.target.value })} placeholder="Registered supplier name" /></label>
          <label>Procurement method<input list="procurement-methods" value={procurementDraft.procurement_method} onChange={(event) => setProcurementDraft({ ...procurementDraft, procurement_method: event.target.value })} /><datalist id="procurement-methods"><option value="Competitive bidding" /><option value="Small Value Procurement" /><option value="Negotiated procurement" /><option value="Direct contracting" /><option value="Agency-to-agency" /><option value="Other method" /></datalist></label>
          <label>PO / contract reference<input value={procurementDraft.purchase_order_number ?? ""} onChange={(event) => setProcurementDraft({ ...procurementDraft, purchase_order_number: event.target.value })} placeholder="Optional reference" /></label>
          <label>Quantity<input type="number" min="0.001" step="0.001" value={procurementDraft.quantity} onChange={(event) => setProcurementDraft({ ...procurementDraft, quantity: Number(event.target.value) })} /></label>
          <label>Unit<input value={procurementDraft.unit} onChange={(event) => setProcurementDraft({ ...procurementDraft, unit: event.target.value })} placeholder="lot, pax, unit, day" /></label>
          <label>Unit cost (₱)<input type="number" min="0" step="0.01" value={procurementDraft.unit_cost} onChange={(event) => setProcurementDraft({ ...procurementDraft, unit_cost: Number(event.target.value) })} /></label>
          <label>Delivery status<select value={procurementDraft.delivery_status} onChange={(event) => setProcurementDraft({ ...procurementDraft, delivery_status: event.target.value })}><option>For procurement</option><option>Purchase order issued</option><option>Partially delivered</option><option>Delivered</option><option>Inspected and accepted</option><option>Cancelled</option></select></label>
          <label>Delivery date<input type="date" value={procurementDraft.delivery_date ?? ""} onChange={(event) => setProcurementDraft({ ...procurementDraft, delivery_date: event.target.value || null })} /></label>
        </div>
        <div className="finance-form-actions">{editingProcurementItemId && <button className="button secondary" onClick={() => { setEditingProcurementItemId(null); setProcurementDraft({ category: "Food and catering", item_description: "", supplier_name: "", procurement_method: "Small Value Procurement", purchase_order_number: "", quantity: 1, unit: "lot", unit_cost: 0, delivery_status: "For procurement", delivery_date: null }); }}>Cancel edit</button>}<button className="button primary" onClick={() => void addProcurementItem()}><Save size={14} /> {editingProcurementItemId ? "Update supplier line" : "Save supplier line online"}</button></div>
      </section>}
    </div>
  ) : null;
  const toggleTimelineStep = (activityId: string, stepId: string, defaultExpanded: boolean) => {
    const key = `${activityId}:${stepId}`;
    setExpandedTimelineSteps((current) => ({ ...current, [key]: !(current[key] ?? defaultExpanded) }));
  };
  const getCompletedSubSteps = (activity: Activity, step: WorkflowStep, stepIndex: number) => {
    const explicit = activity.completedSubSteps?.[step.id];
    if (explicit) return explicit;
    const currentStepIndex = activeSteps.findIndex((item) => item.title === activity.currentStep);
    const currentSubStepIndex = (activeSteps[currentStepIndex]?.subSteps ?? []).indexOf(activity.currentSubStep ?? "");
    if (stepIndex < currentStepIndex) return step.subSteps ?? [];
    if (stepIndex === currentStepIndex && currentSubStepIndex >= 0) return (step.subSteps ?? []).slice(0, currentSubStepIndex + 1);
    return [];
  };
  const getActivityProgress = (activity: Activity) => {
    const workflowSteps = activeSteps;
    const totalSubSteps = workflowSteps.reduce((total, step) => total + (step.subSteps?.length ?? 0), 0);
    if (totalSubSteps > 0) {
      const completedSubSteps = workflowSteps.reduce((total, step, index) => total + getCompletedSubSteps(activity, step, index).length, 0);
      return Math.round(Math.min(1, completedSubSteps / totalSubSteps) * 100);
    }
    const currentStepIndex = workflowSteps.findIndex((step) => step.title === activity.currentStep);
    return activity.status === "Completed" ? 100 : Math.round(Math.max(0, currentStepIndex) / Math.max(1, workflowSteps.length) * 100);
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
    tab: "dashboard" | "programs" | "details" | "workflow" | "activities" | "settings" | "finance",
    message: string,
  ) => {
    setActiveTab(tab);
    if (tab === "finance" && program.id) void loadAnnualAllocations(program.id).then(setAnnualAllocations).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load annual allocations"));
    setNotice(message);
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
            <li>Apply any missing migrations through <code>007</code> in order. On an existing database, run only migrations that have not already been applied.</li>
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
              {systemRole === "superadmin" && <button
                className={activeTab === "programs" ? "top-nav-item active" : "top-nav-item"}
                onClick={() => navigateTo("programs", "Programs opened")}
              >
                <ClipboardList size={14} /> Programs
              </button>}
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
              <button className={activeTab === "finance" ? "top-nav-item active" : "top-nav-item"} onClick={() => navigateTo("finance", "Financial management opened")}>
                <CircleDollarSign size={14} /> Finance
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
        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <p className="eyebrow">
                {activeTab === "dashboard" ? (systemRole === "superadmin" ? "System dashboard" : "Program dashboard") : activeTab === "programs" ? "Programs" : activeTab === "finance" ? "Financial management" : activeTab === "settings" && settingsSection === "database" ? "Superadmin tools" : `${program.acronym} workspace`}
              </p>
              <h1>{activeTab === "dashboard" ? (systemRole === "superadmin" ? "System dashboard" : "Program dashboard") : activeTab === "programs" ? "Programs" : activeTab === "details" ? "Program details" : activeTab === "activities" ? "Activity register" : activeTab === "finance" ? "Annual allocations & utilization" : "Settings"}</h1>
              <p className="page-intro">
                {activeTab === "dashboard" ? (systemRole === "superadmin" ? "Monitor all programs, activities, budgets, and user access." : "Monitor activity totals, utilization, and overdue work.") : activeTab === "programs" ? "Create programs, edit program details, and assign program administrators." : activeTab === "finance" ? "Track appropriations, allotments, obligations, disbursements, accounts payable, cash advances, liquidation, and savings by fiscal year." : activeTab === "settings" && settingsSection === "database" ? "Browse database records in the read-only Superadmin database viewer." : "Manage the program's operational sequence and fund-tracking rules."}
              </p>
            </div>
            <div className="heading-actions">
              <span className="draft-pill">
                <span /> {notice || "Unsaved changes"}
              </span>
              {isAdmin && program.id && activeTab !== "finance" && !(activeTab === "settings" && settingsSection === "database") && <button className="button primary" onClick={() => void saveProgramChanges()}>
                <Save size={16} /> {saved ? "Saved" : "Save program"}
              </button>}
            </div>
          </section>
          {profile?.id === session?.user.id && systemRole === "user" && (
            <section className="role-access-notice" role="status">
              <div>
                <strong>{profileLoadError?.userId === session?.user.id ? "Could not verify your administrator access" : "Some create and administration controls are restricted"}</strong>
                <p>
                  {profileLoadError?.userId === session?.user.id
                    ? `Your profile role could not be loaded (${profileLoadError?.message}). Confirm migrations 003 and 004 are applied, then reload.`
                    : `Signed in as ${session?.user.email ?? "this account"} with system role “user” and program role “${programRole}”. Creating programs requires Superadmin; adding workflow steps requires Superadmin or Program admin.`}
                </p>
                {profileLoadError?.userId !== session?.user.id && <details>
                  <summary>Show SQL for the Supabase project owner</summary>
                  <pre>{`update public.profiles
set system_role = 'superadmin'
where lower(email) = lower('your-auth-email@example.com');`}</pre>
                  <small>Replace the example email with the email of your existing Supabase Auth user, run this in Supabase SQL Editor, then sign out and sign back in. Do not promote a program user.</small>
                </details>}
              </div>
            </section>
          )}
          {activeTab === "dashboard" ? (
            <div className="dashboard-grid">
              <section className="dashboard-panel dashboard-program-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">{systemRole === "superadmin" ? "System portfolio" : "Program profile"}</p><h2>{systemRole === "superadmin" ? "All programs" : program.title}</h2></div><span className="dashboard-muted">{dashboardProgramCount} program{dashboardProgramCount === 1 ? "" : "s"}</span></div>{systemRole === "superadmin" ? <div className="superadmin-program-list">{programOptions.map((item) => <button className="superadmin-program-row" key={item.id} onClick={() => openProgramWorkspace(item.id)} aria-label={`Open ${item.acronym} finance and program workspace`}><span className="program-summary-copy">{item.logo ? <img src={item.logo} alt="" /> : <ShieldCheck size={28} />}<span><strong>{item.acronym}</strong><small>{item.title}</small></span></span><span><b>{(activitiesByProgram[item.id] ?? []).length}</b><small>activities</small></span><span className="program-row-open-label">Open workspace</span><ChevronDown size={17} /></button>)}</div> : <div className="program-summary"><div className="program-summary-copy">{program.logo ? <img src={program.logo} alt="" /> : <ShieldCheck size={28} />}<div><strong>{program.acronym}</strong><span>{program.agency}</span><span>{program.office}</span></div></div><div><small>Beneficiaries</small><strong>{program.beneficiaries}</strong></div><p>{program.description}</p></div>}</section>
              <div className="dashboard-card dashboard-total"><span className="dashboard-label">Total activities</span><strong>{dashboardTotals.activities}</strong><small>{systemRole === "superadmin" ? "Across all programs" : `Registered in ${program.acronym}`}</small></div>
              <div className="dashboard-card"><span className="dashboard-label">Approved budget</span><strong>₱{dashboardTotals.budget.toLocaleString()}</strong><small>Across all activities</small></div>
              <div className="dashboard-card"><span className="dashboard-label">Recorded spending</span><strong>₱{dashboardTotals.spent.toLocaleString()}</strong><small>{dashboardTotals.budget ? Math.round((dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}% utilized</small></div>
              <div className="dashboard-card dashboard-overdue"><span className="dashboard-label">Overdue activities</span><strong>{dashboardTotals.overdue}</strong><small>Past target end date</small></div>
              <section className="dashboard-panel dashboard-analytics-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">At a glance</p><h2>Activity portfolio</h2></div><span className="dashboard-muted">Live data</span></div><div className="dashboard-chart-grid"><div className="chart-block"><div className="chart-heading"><strong>Activities by status</strong><span>{dashboardTotals.activities} total</span></div><div className="status-bars">{dashboardStatusSummary.map((status) => <div className="status-bar-row" key={status.label}><span>{status.label}</span><div className="status-bar-track"><i className={status.className} style={{ width: `${dashboardTotals.activities ? (status.count / dashboardTotals.activities) * 100 : 0}%` }} /></div><b>{status.count}</b></div>)}</div></div><div className="chart-block budget-chart"><div className="chart-heading"><strong>Budget utilization</strong><span>{dashboardTotals.budget ? Math.round((dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}% used</span></div><div className="budget-gauge"><div className="budget-gauge-fill" style={{ width: `${dashboardTotals.budget ? Math.min(100, (dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}%` }} /></div><div className="budget-legend"><span><i className="legend-spent" /> Spent <b>₱{dashboardTotals.spent.toLocaleString()}</b></span><span><i className="legend-remaining" /> Remaining <b>₱{Math.max(0, dashboardTotals.budget - dashboardTotals.spent).toLocaleString()}</b></span></div></div></div></section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Needs attention</p><h2>Overdue activities</h2></div><button className="button secondary" onClick={() => navigateTo("activities", "Overdue activities opened")}>View activities</button></div>{dashboardActivities.filter((activity) => activity.endDate < today && activity.status !== "Completed").length ? <div className="overdue-list">{dashboardActivities.filter((activity) => activity.endDate < today && activity.status !== "Completed").map((activity) => <button className="overdue-row" key={activity.id} onClick={() => { setSelectedActivityId(activity.id); setShowActivityDialog(true); }}><span className="overdue-dot" /><span><strong>{activity.name}</strong><small>{activity.location} · Due {activity.endDate}</small></span><span className="status-tag status-revision">{activity.status}</span></button>)}</div> : <div className="empty-state"><Check size={20} /> No overdue activities</div>}</section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">{systemRole === "superadmin" ? "Portfolio activity" : "Program activity"}</p><h2>Current progress</h2></div><span className="dashboard-muted">{dashboardActivities.length} activities</span></div><div className="dashboard-progress-list">{dashboardActivities.slice(0, 5).map((activity) => <div className="dashboard-progress-row" key={activity.id}><div><strong>{activity.name}</strong><small>{getNumberedStep(steps, activity.currentStep)}</small></div><div className="dashboard-progress-bar"><span style={{ width: `${activity.budget ? Math.min(100, (activity.spent / activity.budget) * 100) : 0}%` }} /></div><b>{activity.budget ? Math.round((activity.spent / activity.budget) * 100) : 0}%</b></div>)}</div></section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Completed work</p><h2>Finished activities</h2></div><span className="dashboard-muted">{dashboardActivities.filter((activity) => activity.status === "Completed").length} finished</span></div>{dashboardActivities.filter((activity) => activity.status === "Completed").length ? <div className="finished-list">{dashboardActivities.filter((activity) => activity.status === "Completed").map((activity) => <button className="finished-row" key={activity.id} onClick={() => { setSelectedActivityId(activity.id); setShowActivityDialog(true); }}><span className="finished-check"><Check size={13} /></span><span><strong>{activity.name}</strong><small>{activity.location} · Finished {activity.endDate}</small></span><span className="status-tag status-completed">Completed</span></button>)}</div> : <div className="empty-state"><Check size={20} /> No finished activities</div>}</section>
            </div>
          ) : activeTab === "finance" ? (
            <section className="finance-page">
              <div className="finance-toolbar">
                <div><p className="eyebrow">{program.acronym} · Annual financial records</p><h2>Fiscal-year funding and utilization</h2><p>Each fiscal year and fund source is stored as its own database record.</p></div>
                <label className="fiscal-year-select">Fiscal year<input type="number" min="2000" max="2200" value={selectedFiscalYear} onChange={(event) => setSelectedFiscalYear(Number(event.target.value))} /></label>
              </div>
              {(() => {
                const rows = annualAllocations.filter((row) => row.fiscal_year === selectedFiscalYear);
                const totals = rows.reduce((total, row) => ({
                  appropriation: total.appropriation + Number(row.appropriation),
                  allotment: total.allotment + Number(row.allotment_received),
                  obligations: total.obligations + Number(row.obligations),
                  disbursements: total.disbursements + Number(row.disbursements),
                }), { appropriation: 0, allotment: 0, obligations: 0, disbursements: 0 });
                const peso = (amount: number) => `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                return <>
                  <div className="finance-summary-grid">
                    <article><small>Allocated budget / appropriation</small><strong>{peso(totals.appropriation)}</strong><span>Annual budget authority</span></article>
                    <article><small>Allotment received</small><strong>{peso(totals.allotment)}</strong><span>Allotment utilization: {totals.allotment ? Math.round(totals.obligations / totals.allotment * 100) : 0}%</span></article>
                    <article><small>Obligations</small><strong>{peso(totals.obligations)}</strong><span>Unobligated allotment: {peso(totals.allotment - totals.obligations)}</span></article>
                    <article><small>Disbursements</small><strong>{peso(totals.disbursements)}</strong><span>Unpaid obligations: {peso(totals.obligations - totals.disbursements)}</span></article>
                  </div>
                  <div className="finance-content-grid">
                    <section className="finance-card">
                      <div className="section-title">
                        <div><h3>Annual allocation records</h3><p>GAA, continuing appropriations, trust receipts, and other sources.</p></div>
                        <div className="finance-records-actions">
                          <span className="dashboard-muted">{rows.length} rows</span>
                          {canEdit && <button className="button primary" onClick={() => { setEditingAllocationId(null); setAllocationDraft(createEmptyAllocationDraft()); setShowAllocationForm(true); }}><Plus size={15} /> Add FY {selectedFiscalYear} allocation</button>}
                        </div>
                      </div>
                      {rows.length ? <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Fund source</th><th>Allocated budget</th><th>Allotment received</th><th>Obligations</th><th>Disbursements</th><th>Unobligated allotment</th>{canEdit && <th>Actions</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.fund_source}</strong><small>{row.remarks || `FY ${row.fiscal_year}`}</small></td><td>{peso(Number(row.appropriation))}</td><td>{peso(Number(row.allotment_received))}<small>{row.allotment_reference || "SARO/NCA ref. not recorded"}</small></td><td>{peso(Number(row.obligations))}<small>{row.obligation_reference || "ORS/BURS ref. not recorded"}</small></td><td>{peso(Number(row.disbursements))}<small>{row.disbursement_reference || "DV/ADA ref. not recorded"}</small></td><td>{peso(Number(row.allotment_received) - Number(row.obligations))}</td>{canEdit && <td><div className="finance-row-actions"><button className="button secondary" onClick={() => { setEditingAllocationId(row.id); setAllocationDraft({ fund_source: row.fund_source, allotment_reference: row.allotment_reference ?? "", obligation_reference: row.obligation_reference ?? "", disbursement_reference: row.disbursement_reference ?? "", appropriation: String(row.appropriation), allotment_received: String(row.allotment_received), obligations: String(row.obligations), disbursements: String(row.disbursements), accounts_payable: String(row.accounts_payable), cash_advances: String(row.cash_advances), liquidation: String(row.liquidation), savings: String(row.savings), remarks: row.remarks ?? "" }); setShowAllocationForm(true); }}>Edit</button><button className="icon-button danger" aria-label={`Delete ${row.fund_source} allocation`} onClick={() => void removeAllocation(row.id)}><Trash2 size={15} /></button></div></td>}</tr>)}</tbody></table></div> : <div className="empty-state">No financial records for FY {selectedFiscalYear} yet.</div>}
                      {rows.map((row) => <details className="finance-record-details" key={`${row.id}-details`}><summary>Additional financial details · {row.fund_source}</summary><div><span>Accounts payable <b>{peso(Number(row.accounts_payable))}</b></span><span>Cash advances <b>{peso(Number(row.cash_advances))}</b></span><span>Liquidation <b>{peso(Number(row.liquidation))}</b></span><span>Savings <b>{peso(Number(row.savings))}</b></span></div></details>)}
                    </section>
                    {canEdit && showAllocationForm && <div className="dialog-overlay allocation-dialog-overlay" onClick={(event) => { if (event.target === event.currentTarget && !allocationSaving) { setEditingAllocationId(null); setAllocationDraft(createEmptyAllocationDraft()); setShowAllocationForm(false); } }}>
                      <dialog open className="activity-dialog allocation-dialog" aria-labelledby="allocation-dialog-title">
                      <section className="finance-card allocation-form">
                      <div className="section-title"><div><p className="eyebrow">FY {selectedFiscalYear} · Annual allocation</p><h3 id="allocation-dialog-title">{editingAllocationId ? "Edit allocation" : `Add FY ${selectedFiscalYear} allocation`}</h3><p>Amounts are validated against the appropriation-to-disbursement ceilings.</p></div><button className="icon-button" aria-label="Close allocation dialog" disabled={allocationSaving} onClick={() => { setEditingAllocationId(null); setAllocationDraft(createEmptyAllocationDraft()); setShowAllocationForm(false); }}><X size={17} /></button></div>
                      <div className="finance-form-grid">
                        <label>Fund source<input value={allocationDraft.fund_source} onChange={(event) => setAllocationDraft({ ...allocationDraft, fund_source: event.target.value })} placeholder="e.g. GAA, continuing appropriation" /></label>
                        <label>Allocated budget / appropriation<input type="number" min="0" value={allocationDraft.appropriation} onChange={(event) => setAllocationDraft({ ...allocationDraft, appropriation: event.target.value })} /></label>
                        <label>Allotment received<input type="number" min="0" value={allocationDraft.allotment_received} onChange={(event) => setAllocationDraft({ ...allocationDraft, allotment_received: event.target.value })} /><small>SARO / NCA or other allotment authority amount</small></label>
                        <label>Allotment reference<input value={allocationDraft.allotment_reference} onChange={(event) => setAllocationDraft({ ...allocationDraft, allotment_reference: event.target.value })} placeholder="SARO / NCA number" /></label>
                        <label>Obligations<input type="number" min="0" value={allocationDraft.obligations} onChange={(event) => setAllocationDraft({ ...allocationDraft, obligations: event.target.value })} /><small>Obligations recorded against the allotment</small></label>
                        <label>Obligation reference<input value={allocationDraft.obligation_reference} onChange={(event) => setAllocationDraft({ ...allocationDraft, obligation_reference: event.target.value })} placeholder="ORS / BURS number" /></label>
                        <label>Disbursements<input type="number" min="0" value={allocationDraft.disbursements} onChange={(event) => setAllocationDraft({ ...allocationDraft, disbursements: event.target.value })} /><small>Payments released against obligations</small></label>
                        <label>Disbursement reference<input value={allocationDraft.disbursement_reference} onChange={(event) => setAllocationDraft({ ...allocationDraft, disbursement_reference: event.target.value })} placeholder="DV / ADA / check reference" /></label>
                        <label>Accounts payable<input type="number" min="0" value={allocationDraft.accounts_payable} onChange={(event) => setAllocationDraft({ ...allocationDraft, accounts_payable: event.target.value })} /></label>
                        <label>Cash advances<input type="number" min="0" value={allocationDraft.cash_advances} onChange={(event) => setAllocationDraft({ ...allocationDraft, cash_advances: event.target.value })} /></label>
                        <label>Liquidation<input type="number" min="0" value={allocationDraft.liquidation} onChange={(event) => setAllocationDraft({ ...allocationDraft, liquidation: event.target.value })} /></label>
                        <label>Savings / reverted balance<input type="number" min="0" value={allocationDraft.savings} onChange={(event) => setAllocationDraft({ ...allocationDraft, savings: event.target.value })} /></label>
                        <label className="finance-form-wide">Remarks<input value={allocationDraft.remarks} onChange={(event) => setAllocationDraft({ ...allocationDraft, remarks: event.target.value })} placeholder="Reference, fund validity, or notes" /></label>
                      </div>
                      <div className="finance-form-actions"><button className="button secondary" disabled={allocationSaving} onClick={() => { setEditingAllocationId(null); setAllocationDraft(createEmptyAllocationDraft()); setShowAllocationForm(false); }}>{editingAllocationId ? "Cancel edit" : "Cancel"}</button><button className="button primary" disabled={allocationSaving} onClick={() => void saveAllocation()}><Save size={14} /> {allocationSaving ? "Saving..." : "Save to online database"}</button></div>
                      </section>
                      </dialog>
                    </div>}
                  </div>
                </>;
              })()}
            </section>
          ) : (
          <div className={`builder-layout ${activeTab === "activities" ? "activities-layout" : ""}`}>
            <section className="builder-panel">
              {activeTab === "programs" && !showProgramDetailDialog ? (
                <div className="programs-page">
                  <div className="section-title"><div><p className="eyebrow">Superadmin workspace</p><h2>All programs</h2><p>Select a program to view or edit its details.</p></div><button className="button primary" onClick={() => setShowProgramCreateDialog(true)}><Plus size={15} /> Create program</button></div>
                  <div className="programs-list">
                    {programOptions.map((item) => <div className={`program-list-entry ${item.id === program.id ? "selected" : ""}`} key={item.id}>
                      <button className="program-list-row" onClick={() => openProgramWorkspace(item.id)} aria-label={`Open ${item.acronym} finance and program workspace`}><span className="program-list-mark">{item.acronym.slice(0, 2)}</span><span><strong>{item.title}</strong><small>{item.acronym} · {item.agency}</small></span><span className="program-list-count">{(activitiesByProgram[item.id] ?? []).length} activities</span><span className="program-row-open-label">Open workspace</span><ChevronDown size={18} /></button>
                      <button className="button secondary program-list-details" onClick={() => { selectProgram(item.id); setProgramDialogEditing(false); setProgramDialogTab("details"); setShowProgramDetailDialog(true); }}><Settings size={14} /> Settings</button>
                    </div>)}
                  </div>
                </div>
              ) : showProgramDetailDialog || activeTab === "details" ? (
                <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setShowProgramDetailDialog(false); setActiveTab("programs"); }}>
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
                  <button className="icon-button profile-dialog-close" aria-label="Close program details" onClick={() => { setShowProgramDetailDialog(false); setActiveTab("programs"); }}><X size={17} /></button>
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
              {activeTab === "activities" && (
                <div className="activity-panel">
                  <div className="activity-toolbar">
                    <div>
                      <p className="eyebrow">
                        {program.acronym} activity register
                      </p>
                      <h2>Activities</h2>
                      <p>
                        Track each approved activity from planning through
                        procurement, implementation, liquidation, and savings.
                      </p>
                    </div>
                    <label className="activity-search"><Search size={16} /><input value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} placeholder="Search activities, locations, or status" aria-label="Search activities" /></label>
                    {canEdit && <button
                      className="button primary"
                          onClick={() => {
                            setEditingActivityId(null);
                            setNewActivity({ name: "", location: "", startDate: "", endDate: "", budget: "", spent: "0", activityDesign: "", status: "Planning", currentStep: steps[0]?.title ?? "", currentSubStep: steps[0]?.subSteps?.[0] ?? "" });
                            setShowActivityForm(true);
                          }}
                      >
                          <Plus size={16} /> {editingActivityId ? "Edit activity" : "Create activity"}
                      </button>}
                  </div>
                  <div className="activity-tabs" role="tablist" aria-label="Activity views">
                    <span className="activity-view active"><Table2 size={15} /> Activity table</span>
                  </div>
                  {showActivityForm && (
                    <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setShowActivityForm(false); setEditingActivityId(null); }}>
                    <dialog open className="activity-form activity-dialog">
                      <div className="activity-form-heading"><div><p className="eyebrow">Activity register</p><h2>{editingActivityId ? "Edit activity" : "Create activity"}</h2><p>Capture the activity details, budget, and current workflow position.</p></div><button className="icon-button" aria-label="Close activity form" onClick={() => { setShowActivityForm(false); setEditingActivityId(null); }}><X size={17} /></button></div>
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
                            Recorded spending
                            <input type="number" min="0" value={newActivity.spent} onChange={(event) => setNewActivity({ ...newActivity, spent: event.target.value })} placeholder="0.00" />
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
                              {activity.location} <span>•</span>{" "}
                              {activity.startDate} to {activity.endDate}
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
                                {selectedActivity.startDate} to{" "}
                                {selectedActivity.endDate}
                              </p>
                            </div>
                            <div className="detail-actions">
                              {canEdit && <button className="button secondary" onClick={() => editActivity(selectedActivity)}>Edit activity</button>}
                              {isAdmin && <button className="icon-button danger" aria-label="Delete activity" onClick={() => deleteActivity(selectedActivity.id)}><Trash2 size={17} /></button>}
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
                              <small>Recorded spending</small>
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
                          <div className="timeline">
                            {activeSteps.map((step, index) => {
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
                            })}
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
                                <span>{activity.startDate}</span>
                                <small>to {activity.endDate}</small>
                              </td>
                              <td>
                                <strong>
                                  ₱{activity.budget.toLocaleString()}
                                </strong>
                                <small>
                                  Spent ₱{activity.spent.toLocaleString()}
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
                            {canEdit && <button className="button secondary" onClick={() => editActivity(selectedActivity)}>Edit activity</button>}
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
                            <div className="timeline">
                              {activeSteps.map((step, index) => {
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
                              })}
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
                      <h2>Program settings</h2>
                      <p>Manage the program workflow and review database records where permitted.</p>
                    </div>
                  </div>
                  <div className="settings-switcher">
                    <button className={settingsSection === "fund-workflow" ? "settings-switch active" : "settings-switch"} onClick={() => setSettingsSection("fund-workflow")}>Fund workflow</button>
                    {isAdmin && <button className={settingsSection === "audit" ? "settings-switch active" : "settings-switch"} onClick={() => setSettingsSection("audit")}>Audit log</button>}
                    {systemRole === "superadmin" && <button className={settingsSection === "database" ? "settings-switch active" : "settings-switch"} onClick={() => { setSettingsSection("database"); void loadDatabaseBrowser(); }}>Database</button>}
                  </div>
                  {settingsSection === "database" && systemRole === "superadmin" ? (
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

            {activeTab !== "activities" && <aside className="preview-column">
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

          {activeTab === "dashboard" && selectedActivity && showActivityDialog && (
            <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setSelectedActivityId(""); setShowActivityDialog(false); }}>
              <dialog open className="activity-detail activity-dialog dashboard-activity-dialog">
                <div className="detail-heading">
                  <div>
                    <p className="eyebrow">Activity overview</p>
                    <h2>{selectedActivity.name}</h2>
                    <p className="detail-subtitle">{selectedActivity.location} · {selectedActivity.startDate} to {selectedActivity.endDate}</p>
                  </div>
                  <button className="icon-button" aria-label="Close activity" onClick={() => { setSelectedActivityId(""); setShowActivityDialog(false); }}><X size={17} /></button>
                </div>
                <div className="fund-summary">
                  <div><small>Status</small><strong>{selectedActivity.status}</strong></div>
                  <div><small>Approved budget</small><strong>₱{selectedActivity.budget.toLocaleString()}</strong></div>
                  <div><small>Recorded spending</small><strong>₱{selectedActivity.spent.toLocaleString()}</strong></div>
                </div>
                <div className="dashboard-activity-meta"><span>Current workflow step</span><strong>{getNumberedStep(steps, selectedActivity.currentStep)}</strong>{selectedActivity.currentSubStep && <><span>Current sub-step</span><strong>{(activeSteps.findIndex((step) => step.title === selectedActivity.currentStep) + 1)}.{(selectedActivityStep?.subSteps ?? []).indexOf(selectedActivity.currentSubStep) + 1} {selectedActivity.currentSubStep}</strong></>}</div>
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
