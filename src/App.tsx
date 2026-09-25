import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  ClipboardList,
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
import { createActivity as createDatabaseActivity, createManagedUser, createProgram, createWorkflowStep, databaseConfigured, deleteActivity as deleteDatabaseActivity, getAuthSession, loadActivities, loadAdminDatabaseTables, loadAuditLogs, loadMembers, loadPrograms, loadProfile, loadWorkflowSteps, manageProgramUser, signIn, signOut, subscribeToAuth, updateActivity as updateDatabaseActivity, updateProgram as updateDatabaseProgram, updateWorkflowStep } from "./lib/database";
import type { AppProfile, AuditLog, ProgramMember } from "./lib/database";

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

type LocalDraftState = {
  programOptions: ProgramConfig[];
  program: ProgramConfig;
  steps: WorkflowStep[];
  activities: Activity[];
  organizations: string[];
};

const localDraftKey = "da-rfo-car-tracking-draft";
const localAccountsKey = "da-rfo-car-tracking-accounts";
const localSessionKey = "da-rfo-car-tracking-session";
type LocalAccount = { email: string; password: string; fullName: string; systemRole: "superadmin" | "user"; programRole?: "program_admin" | "viewer"; programId?: string };

function readLocalDraft(): Partial<LocalDraftState> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(localDraftKey) ?? "{}");
  } catch {
    return {};
  }
}

function readLocalSessionAccount(): LocalAccount | null {
  if (typeof window === "undefined" || databaseConfigured) return null;
  const email = window.localStorage.getItem(localSessionKey);
  const accounts = JSON.parse(window.localStorage.getItem(localAccountsKey) ?? "[]") as LocalAccount[];
  return accounts.find((account) => account.email === email) ?? null;
}

function readLocalProgramMembers(programId: string): ProgramMember[] {
  if (typeof window === "undefined") return [];
  const accounts = JSON.parse(window.localStorage.getItem(localAccountsKey) ?? "[]") as LocalAccount[];
  return accounts.filter((account) => account.programId === programId && account.programRole).map((account, index) => ({
    id: `local-member-${programId}-${index}`,
    program_id: programId,
    user_id: `local-user-${account.email}`,
    role: account.programRole === "program_admin" ? "program_admin" : "viewer",
    profile: { id: `local-user-${account.email}`, full_name: account.fullName, email: account.email, system_role: "user" },
  }));
}

const amiaWorkflow: WorkflowStep[] = [
  {
    id: "amia-workplan",
    title: "Activity Proposal & Work Plan",
    description:
      "Define the activity, target beneficiaries, expected outputs, schedule, and cost estimates.",
    assignedRole: "AMIA Program Unit",
    requiredDocuments: "Activity proposal, Work and financial plan",
    slaDays: 5,
    status: "Completed",
    isOptional: false,
    active: true,
  },
  {
    id: "amia-fund",
    title: "Fund Allocation & Obligation",
    description:
      "Confirm available allotment and record the obligation against the approved activity budget.",
    assignedRole: "Budget and Finance Division",
    requiredDocuments: "Obligation request, Budget utilization request",
    slaDays: 4,
    status: "In Progress",
    isOptional: false,
    active: true,
  },
  {
    id: "amia-procurement",
    title: "Activity Procurement",
    description:
      "Prepare the purchase request, canvass or bidding documents, and procurement recommendation.",
    assignedRole: "Procurement Management Unit",
    requiredDocuments: "Purchase request, Canvass, Abstract of quotations",
    slaDays: 10,
    status: "Pending",
    isOptional: false,
    active: true,
    subSteps: [
      "Prepare purchase request",
      "Conduct canvass or bidding",
      "Evaluate quotations",
      "Prepare procurement recommendation",
    ],
  },
  {
    id: "amia-award",
    title: "Purchase Order / Contract Award",
    description:
      "Issue the purchase order or contract and notify the selected supplier or service provider.",
    assignedRole: "BAC Secretariat / Supply Office",
    requiredDocuments: "BAC resolution, Purchase order, Contract",
    slaDays: 5,
    status: "Pending",
    isOptional: false,
    active: true,
  },
  {
    id: "amia-delivery",
    title: "Delivery, Inspection & Acceptance",
    description:
      "Verify delivered goods or completed services against the approved specifications and activity plan.",
    assignedRole: "Inspection and Acceptance Committee",
    requiredDocuments: "Delivery receipt, Inspection report, Acceptance report",
    slaDays: 7,
    status: "Pending",
    isOptional: false,
    active: true,
  },
  {
    id: "amia-implementation",
    title: "Activity Implementation & Distribution",
    description:
      "Conduct the approved activity and document distribution, attendance, outputs, and beneficiary acknowledgement.",
    assignedRole: "AMIA Field Operations Team",
    requiredDocuments:
      "Attendance sheet, Distribution list, Photo documentation",
    slaDays: 15,
    status: "Pending",
    isOptional: false,
    active: true,
  },
  {
    id: "amia-liquidation",
    title: "Accomplishment & Liquidation",
    description:
      "Submit the accomplishment report and supporting financial documents for liquidation and payment recording.",
    assignedRole: "AMIA Program Unit / Finance",
    requiredDocuments: "Accomplishment report, Disbursement voucher, Receipts",
    slaDays: 10,
    status: "Pending",
    isOptional: false,
    active: true,
  },
  {
    id: "amia-savings",
    title: "Savings & Fund Reversion",
    description:
      "Reconcile actual expenditures against the obligation, record savings, and process fund reversion or realignment.",
    assignedRole: "Finance and Accounting Division",
    requiredDocuments:
      "Obligation reconciliation, Savings report, Reversion document",
    slaDays: 7,
    status: "Pending",
    isOptional: false,
    active: true,
  },
];

const fourKWorkflow: WorkflowStep[] = [
  {
    id: "4k-plan",
    title: "Enterprise Activity Planning",
    description:
      "Identify the livelihood enterprise, beneficiaries, outputs, and approved implementation schedule.",
    assignedRole: "4K Program Unit",
    requiredDocuments: "Enterprise proposal, Beneficiary profile",
    slaDays: 7,
    status: "Completed",
    isOptional: false,
    active: true,
  },
  {
    id: "4k-fund",
    title: "Fund Availability & Obligation",
    description:
      "Validate the program allocation and record the approved obligation for the enterprise activity.",
    assignedRole: "Budget and Finance Division",
    requiredDocuments: "Work and financial plan, Obligation request",
    slaDays: 5,
    status: "In Progress",
    isOptional: false,
    active: true,
  },
  {
    id: "4k-procurement",
    title: "Procurement of Inputs / Services",
    description:
      "Procure farm inputs, equipment, or services based on the approved enterprise plan and specifications.",
    assignedRole: "Procurement Management Unit",
    requiredDocuments: "Purchase request, Canvass or bidding documents",
    slaDays: 12,
    status: "Pending",
    isOptional: false,
    active: true,
  },
  {
    id: "4k-delivery",
    title: "Inspection & Acceptance",
    description:
      "Inspect the procured inputs or equipment and confirm quantity, quality, and compliance.",
    assignedRole: "Inspection and Acceptance Committee",
    requiredDocuments: "Delivery receipt, Inspection and acceptance report",
    slaDays: 7,
    status: "Pending",
    isOptional: false,
    active: true,
  },
  {
    id: "4k-release",
    title: "Release & Enterprise Implementation",
    description:
      "Release assistance to qualified beneficiaries and carry out the approved enterprise activity.",
    assignedRole: "4K Field Operations Team",
    requiredDocuments:
      "Release form, Beneficiary acknowledgement, Activity photos",
    slaDays: 15,
    status: "Pending",
    isOptional: false,
    active: true,
  },
  {
    id: "4k-monitoring",
    title: "Monitoring & Accomplishment",
    description:
      "Monitor enterprise progress, validate outputs, and submit the physical and financial accomplishment report.",
    assignedRole: "Planning and Monitoring Division",
    requiredDocuments: "Monitoring report, Accomplishment report",
    slaDays: 20,
    status: "Pending",
    isOptional: false,
    active: true,
  },
  {
    id: "4k-liquidation",
    title: "Liquidation & Savings Recording",
    description:
      "Complete liquidation, reconcile actual cost, and record any unused balance as savings.",
    assignedRole: "4K Program Unit / Finance",
    requiredDocuments: "Liquidation report, Receipts, Savings reconciliation",
    slaDays: 10,
    status: "Pending",
    isOptional: false,
    active: true,
  },
];

const withSampleSubSteps = (workflow: WorkflowStep[]) =>
  workflow.map((step) => ({
    ...step,
    subSteps: step.subSteps?.length
      ? [...step.subSteps]
      : [
          `Prepare ${step.title}`,
          `Complete ${step.title}`,
          `Record ${step.title} outcome`,
        ],
  }));

const sampleActivities: Record<string, Activity[]> = {
  amia: [
    {
      id: "amia-act-1",
      name: "Climate-smart vegetable production inputs",
      location: "Benguet",
      startDate: "2026-04-08",
      endDate: "2026-06-30",
      budget: 850000,
      spent: 420000,
      status: "Activity Procurement",
      currentStep: "Activity Procurement",
    },
    {
      id: "amia-act-2",
      name: "Rainwater harvesting support",
      location: "Ifugao",
      startDate: "2026-05-18",
      endDate: "2026-09-30",
      budget: 1200000,
      spent: 1200000,
      status: "Activity Implementation & Distribution",
      currentStep: "Activity Implementation & Distribution",
    },
    {
      id: "amia-act-3",
      name: "Climate field school and farmer training",
      location: "Mountain Province",
      startDate: "2026-02-03",
      endDate: "2026-03-28",
      budget: 360000,
      spent: 342500,
      status: "Completed",
      currentStep: "Savings & Fund Reversion",
    },
  ],
  "4k": [
    {
      id: "4k-act-1",
      name: "Indigenous coffee enterprise starter kits",
      location: "Apayao",
      startDate: "2026-03-11",
      endDate: "2026-08-30",
      budget: 980000,
      spent: 185000,
      status: "Procurement of Inputs / Services",
      currentStep: "Procurement of Inputs / Services",
    },
    {
      id: "4k-act-2",
      name: "Community vegetable processing enterprise",
      location: "Abra",
      startDate: "2026-01-20",
      endDate: "2026-04-30",
      budget: 720000,
      spent: 696000,
      status: "Completed",
      currentStep: "Liquidation & Savings Recording",
    },
  ],
};

const samplePrograms: ProgramConfig[] = [
  {
    id: "amia",
    title: "Adaptation and Mitigation Initiative in Agriculture",
    acronym: "AMIA",
    agency: "Department of Agriculture",
    office: "Regional Field Office - Cordillera Administrative Region",
    description:
      "A program workspace for managing climate-resilient agriculture activities, procurement, fund utilization, and savings reconciliation.",
    beneficiaries: "Climate-vulnerable farmers, fisherfolk, cooperatives",
    units: "AMIA Program Unit, Field Operations, Finance and Accounting",
    primary: "#1c6653",
    accent: "#d8a642",
    logo: "",
    steps: withSampleSubSteps(amiaWorkflow),
  },
  {
    id: "4k",
    title: "Kabuhayan at Kaunlaran Para sa Kababayang Katutubo",
    acronym: "4K",
    agency: "Department of Agriculture",
    office: "Regional Field Office - Cordillera Administrative Region",
    description:
      "A program workspace for planning, procuring, delivering, and monitoring livelihood enterprise assistance for indigenous communities.",
    beneficiaries: "Indigenous farmer groups and community enterprises",
    units: "4K Program Unit, Procurement, Field Operations, Finance",
    primary: "#315b72",
    accent: "#d6a13f",
    logo: "",
    steps: withSampleSubSteps(fourKWorkflow),
  },
];

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
  subSteps: step.sub_steps?.length
    ? step.sub_steps
    : [`Prepare ${step.title}`, `Complete ${step.title}`, `Record ${step.title} outcome`],
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
  completedSubSteps: {},
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

function App() {
  const localDraft = readLocalDraft();
  const localSessionAccount = readLocalSessionAccount();
  const [programOptions, setProgramOptions] = useState<ProgramConfig[]>(localDraft.programOptions ?? samplePrograms);
  const [program, setProgram] = useState<ProgramConfig>(localDraft.program ?? samplePrograms[0]);
  const [steps, setSteps] = useState<WorkflowStep[]>(
    localDraft.steps ?? withSampleSubSteps(amiaWorkflow),
  );
  const [activities, setActivities] = useState<Activity[]>(
    localDraft.activities ?? sampleActivities.amia,
  );
  const [activitiesByProgram, setActivitiesByProgram] = useState<Record<string, Activity[]>>(() =>
    Object.fromEntries(Object.entries(sampleActivities).map(([id, records]) => [id, records])),
  );
  const [selectedId, setSelectedId] = useState("amia-procurement");
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [stepDialogEditing, setStepDialogEditing] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState("amia-act-1");
  const [expandedTimelineSteps, setExpandedTimelineSteps] = useState<Record<string, boolean>>({});
  const [pendingTimelineStep, setPendingTimelineStep] = useState<{ stepTitle: string; subStep: string; shouldComplete: boolean } | null>(null);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [session, setSession] = useState<Awaited<ReturnType<typeof getAuthSession>>>(null);
  const [authReady, setAuthReady] = useState(!databaseConfigured);
  const [localAuthenticated, setLocalAuthenticated] = useState(() => Boolean(localSessionAccount));
  const [profile, setProfile] = useState<AppProfile | null>(localSessionAccount ? { id: "local-user", full_name: localSessionAccount.fullName, email: localSessionAccount.email, system_role: localSessionAccount.systemRole } : null);
  const [programRole, setProgramRole] = useState<ProgramMember["role"]>(localSessionAccount?.programRole ?? (databaseConfigured ? "viewer" : "program_admin"));
  const [systemRole, setSystemRole] = useState<"superadmin" | "user">(localSessionAccount?.systemRole ?? "user");
  const [members, setMembers] = useState<ProgramMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [accountForm, setAccountForm] = useState({ email: "", fullName: "", password: "", role: "viewer" as "superadmin" | "program_admin" | "viewer" });
  const [programForm, setProgramForm] = useState({ title: "", acronym: "", agency: "Department of Agriculture", office: "", description: "", beneficiaries: "", units: "", adminFullName: "", adminEmail: "", adminPassword: "" });
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [activityDialogTab, setActivityDialogTab] = useState<"timeline" | "design" | "workflow">("workflow");
  const [showProgramAdminDialog, setShowProgramAdminDialog] = useState(false);
  const [showProgramDetailDialog, setShowProgramDetailDialog] = useState(false);
  const [showProgramCreateDialog, setShowProgramCreateDialog] = useState(false);
  const [programDialogEditing, setProgramDialogEditing] = useState(false);
  const [programDialogTab, setProgramDialogTab] = useState<"details" | "admins">("details");
  const [memberDialog, setMemberDialog] = useState<ProgramMember | null>(null);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "programs" | "details" | "workflow" | "activities" | "settings" | "database"
  >("dashboard");
  const [settingsSection, setSettingsSection] = useState<"organizations" | "fund-workflow" | "audit">("organizations");
  const [organizations, setOrganizations] = useState(localDraft.organizations ?? ["AMIA Program Unit", "Procurement Management Unit", "Budget and Finance Division"]);
  const [organizationDraft, setOrganizationDraft] = useState("");
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
        const accounts = JSON.parse(window.localStorage.getItem(localAccountsKey) ?? "[]") as LocalAccount[];
        setDatabaseTables({
          programs: programOptions as unknown as Record<string, unknown>[],
          workflow_steps: programOptions.flatMap((item) => item.steps) as unknown as Record<string, unknown>[],
          program_activities: Object.values(dashboardActivityMap).flat() as unknown as Record<string, unknown>[],
          local_accounts: accounts.map((account) => Object.fromEntries(Object.entries(account).filter(([key]) => key !== "password"))),
        });
      }
      setNotice("Database browser refreshed");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load database contents");
    } finally {
      setDatabaseLoading(false);
    }
  };

  useEffect(() => {
    if (databaseConfigured) return;
    const accounts = JSON.parse(window.localStorage.getItem(localAccountsKey) ?? "[]") as LocalAccount[];
    if (!accounts.some((account) => account.email === "superadmin@gmail.com")) {
      window.localStorage.setItem(localAccountsKey, JSON.stringify([...accounts, { email: "superadmin@gmail.com", password: "password123", fullName: "System Superadmin", systemRole: "superadmin" }]));
    }
    window.localStorage.setItem(localDraftKey, JSON.stringify({
      programOptions,
      program,
      steps,
      activities,
      organizations,
    } satisfies LocalDraftState));
  }, [activities, organizations, program, programOptions, steps]);

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
    void loadProfile(session.user.id).then((loadedProfile) => { setProfile(loadedProfile); setSystemRole(loadedProfile.system_role ?? "user"); }).catch(() => setProfile({ id: session.user.id, full_name: session.user.email ?? "User", email: session.user.email ?? "" }));
  }, [session]);

  useEffect(() => {
    if (!databaseConfigured || !session?.user || !program.id) return;
    void loadMembers(program.id).then((loadedMembers) => {
      setMembers(loadedMembers);
      setProgramRole(loadedMembers.find((member) => member.user_id === session.user.id)?.role ?? "viewer");
    }).catch(() => setMembers([]));
    void loadAuditLogs(program.id).then(setAuditLogs).catch(() => setAuditLogs([]));
  }, [program.id, session]);

  const canEdit = !databaseConfigured || systemRole === "superadmin" || programRole === "program_admin" || programRole === "editor";
  const isAdmin = !databaseConfigured || systemRole === "superadmin" || programRole === "program_admin";
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");
    if (!databaseConfigured) {
      const accounts = JSON.parse(window.localStorage.getItem(localAccountsKey) ?? "[]") as LocalAccount[];
      const account = accounts.find((item) => item.email === loginEmail.trim().toLowerCase() && item.password === loginPassword);
      if (!account) {
        setLoginError("Invalid local account. Create an account first or configure Supabase for production login.");
        return;
      }
      setProfile({ id: "local-user", full_name: account.fullName, email: account.email, system_role: account.systemRole });
      setSystemRole(account.systemRole);
      setProgramRole(account.programRole ?? "viewer");
      setLocalAuthenticated(true);
      window.localStorage.setItem(localSessionKey, account.email);
      return;
    }
    try {
      await signIn(loginEmail.trim(), loginPassword);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to sign in");
    }
  };
  const createAccount = async (forcedRole?: "superadmin" | "program_admin" | "viewer") => {
    const role = forcedRole ?? (systemRole === "superadmin" ? accountForm.role : (programRole === "program_admin" ? accountForm.role : "viewer"));
    const targetProgram = role === "superadmin" ? null : program.id;
    try {
      if (!databaseConfigured) {
        const accounts = JSON.parse(window.localStorage.getItem(localAccountsKey) ?? "[]") as LocalAccount[];
        const email = accountForm.email.trim().toLowerCase();
        if (accounts.some((item) => item.email === email)) throw new Error("That email already has an account");
        window.localStorage.setItem(localAccountsKey, JSON.stringify([...accounts, { email, password: accountForm.password, fullName: accountForm.fullName.trim(), systemRole: "user", programRole: role === "program_admin" ? "program_admin" : "viewer", programId: targetProgram ?? undefined }]));
      } else {
        await createManagedUser(targetProgram, accountForm.email.trim(), accountForm.fullName.trim(), role);
      }
      setNotice(`${role} account created`);
      setAccountForm({ email: "", fullName: "", password: "", role: systemRole === "superadmin" ? "program_admin" : "viewer" });
      if (targetProgram && databaseConfigured) setMembers(await loadMembers(targetProgram));
      if (targetProgram && !databaseConfigured) setMembers(readLocalProgramMembers(targetProgram));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create account");
    }
  };
  const updateMemberAccount = async () => {
    if (!memberDialog) return;
    const fullName = accountForm.fullName.trim();
    const role = accountForm.role === "program_admin" ? "program_admin" : "viewer";
    try {
      if (databaseConfigured) {
        await manageProgramUser("update", program.id, memberDialog.user_id, { fullName, role });
      } else {
        const accounts = JSON.parse(window.localStorage.getItem(localAccountsKey) ?? "[]") as LocalAccount[];
        window.localStorage.setItem(localAccountsKey, JSON.stringify(accounts.map((account) => account.email === memberDialog.profile?.email ? { ...account, fullName, programRole: role } : account)));
      }
      setMembers((current) => current.map((member) => member.id === memberDialog.id ? { ...member, role, profile: { ...member.profile!, full_name: fullName } } : member));
      setNotice("Account updated");
      setMemberDialog(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update account");
    }
  };
  const deleteMemberAccount = async (member: ProgramMember) => {
    if (!window.confirm(`Revoke ${member.profile?.full_name ?? "this user's"} access to ${program.acronym}?`)) return;
    try {
      if (databaseConfigured) {
        await manageProgramUser("delete", program.id, member.user_id);
      } else {
        const accounts = JSON.parse(window.localStorage.getItem(localAccountsKey) ?? "[]") as LocalAccount[];
        window.localStorage.setItem(localAccountsKey, JSON.stringify(accounts.filter((account) => account.email !== member.profile?.email)));
      }
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setNotice("Program access revoked");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not revoke account access");
    }
  };
  const createProgramForSuperadmin = async () => {
    if (systemRole !== "superadmin" || !programForm.title.trim() || !programForm.acronym.trim()) {
      setNotice("Program name and acronym are required");
      return;
    }
    const programValues = {
      title: programForm.title.trim(), acronym: programForm.acronym.trim().toUpperCase(), agency_title: programForm.agency.trim() || "Department of Agriculture", office_subtitle: programForm.office.trim() || null,
      description: programForm.description.trim() || null, target_beneficiaries: programForm.beneficiaries.trim() || null, operating_units: programForm.units.split(",").map((item) => item.trim()).filter(Boolean), logo_url: null, theme_color: "#1c6653", accent_color: "#d8a642", is_active: true,
    };
    const defaultWorkflow = withSampleSubSteps(programValues.acronym === "4K" ? fourKWorkflow : amiaWorkflow);
    try {
      let createdProgramId = "";
      if (databaseConfigured) {
        const created = await createProgram(programValues);
        createdProgramId = created.id;
        const createdSteps = await Promise.all(defaultWorkflow.map((step, index) => createWorkflowStep({
          program_id: created.id,
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
        })));
        const mapped = mapDatabaseProgram(created, createdSteps.map(mapDatabaseStep));
        setProgramOptions((current) => [...current, mapped]);
        setProgram(mapped);
        setSteps(mapped.steps);
        setActivities([]);
      } else {
        createdProgramId = `program-${crypto.randomUUID()}`;
        const mapped: ProgramConfig = { id: createdProgramId, title: programValues.title, acronym: programValues.acronym, agency: programValues.agency_title, office: programValues.office_subtitle ?? "", description: programValues.description ?? "", beneficiaries: programValues.target_beneficiaries ?? "", units: programValues.operating_units.join(", "), primary: programValues.theme_color, accent: programValues.accent_color, logo: "", steps: defaultWorkflow.map((step, index) => ({ ...step, id: `${createdProgramId}-step-${index + 1}` })) };
        setProgramOptions((current) => [...current, mapped]);
        setProgram(mapped);
        setSteps(mapped.steps);
        setActivities([]);
      }
      setProgramForm({ title: "", acronym: "", agency: "Department of Agriculture", office: "", description: "", beneficiaries: "", units: "", adminFullName: "", adminEmail: "", adminPassword: "" });
      setShowProgramCreateDialog(false);
      setNotice("Program created; add its program admin from the program details");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create program");
    }
  };
  useEffect(() => {
    if (!databaseConfigured) return;
    let mounted = true;
    const hydrateFromDatabase = async () => {
      try {
        const records = await loadPrograms();
        if (!mounted || records.length === 0) return;
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
        if (mounted) setNotice("Database unavailable; showing local draft data");
        console.error(error);
      }
    };
    void hydrateFromDatabase();
    return () => { mounted = false; };
  }, []);

  const updateProgram = (field: "title" | "acronym" | "agency" | "office" | "description" | "beneficiaries" | "units" | "primary" | "accent" | "logo", value: string) => {
    if (!isAdmin) return;
    setProgram((current) => ({ ...current, [field]: value }));
    setSaved(false);
    if (databaseConfigured) {
      const databaseField = { title: "title", acronym: "acronym", agency: "agency_title", office: "office_subtitle", description: "description", beneficiaries: "target_beneficiaries", units: "operating_units", primary: "theme_color", accent: "accent_color", logo: "logo_url" }[field];
      const databaseValue = field === "units" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value;
      void updateDatabaseProgram(program.id, { [databaseField]: databaseValue });
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
      void updateWorkflowStep(selectedId, { [databaseField]: databaseValue });
    }
  };
  const saveStepChanges = () => {
    const step = steps.find((item) => item.id === selectedId);
    if (!step) return;
    if (databaseConfigured && !selectedId.startsWith("step-")) {
      void updateWorkflowStep(selectedId, {
        title: step.title,
        description: step.description,
        assigned_role: step.assignedRole,
        required_documents: step.requiredDocuments.split(",").map((item) => item.trim()).filter(Boolean),
        sla_days: step.slaDays,
        status_tag: step.status,
        is_optional: step.isOptional,
        is_active: step.active,
        sub_steps: step.subSteps ?? [],
      }).catch(() => setNotice("Step saved locally; database update failed"));
    }
    setStepDialogEditing(false);
    setShowStepDialog(false);
    setNotice("Workflow step saved");
  };
  const moveStep = (direction: -1 | 1) => {
    const index = steps.findIndex((step) => step.id === selectedId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) return;
    const nextSteps = [...steps];
    [nextSteps[index], nextSteps[nextIndex]] = [
      nextSteps[nextIndex],
      nextSteps[index],
    ];
    setSteps(nextSteps);
    setProgramOptions((programs) => programs.map((item) => item.id === program.id ? { ...item, steps: nextSteps } : item));
    setProgram((current) => current.id === program.id ? { ...current, steps: nextSteps } : current);
    setSaved(false);
  };
  const addStep = () => {
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
      void createWorkflowStep({ program_id: program.id, step_order: steps.length + 1, title: draftStep.title, description: draftStep.description, sub_steps: draftStep.subSteps ?? [], assigned_role: draftStep.assignedRole, required_documents: draftStep.requiredDocuments.split(","), sla_days: draftStep.slaDays, status_tag: draftStep.status, is_optional: false, is_active: true }).then((created) => {
        const mapped = mapDatabaseStep(created);
        setSteps((current) => [...current, mapped]);
        setSelectedId(mapped.id);
      }).catch(() => setNotice("Could not create workflow step"));
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
    const nextProgram = programOptions.find((sample) => sample.id === id);
    if (!nextProgram) return;
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
          return;
        } catch (error) {
          console.error(error);
          setNotice("Could not load the selected program");
        }
      })();
      return;
    }
    setProgram(nextProgram);
    setSteps(withSampleSubSteps(nextProgram.steps));
    setActivities(sampleActivities[id].map((activity) => ({ ...activity })));
    setSelectedId(nextProgram.steps[0].id);
    setSelectedActivityId(sampleActivities[id][0]?.id ?? "");
    setSaved(false);
  };
  const saveActivity = () => {
    if (!newActivity.name.trim()) {
      setNotice("Activity name is required");
      return;
    }
    if (newActivity.startDate && newActivity.endDate && newActivity.endDate < newActivity.startDate) {
      setNotice("Target end date must be after the start date");
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
      startDate: newActivity.startDate || "2026-07-01",
      endDate: newActivity.endDate || "2026-09-30",
      budget,
      spent,
      activityDesign: newActivity.activityDesign.trim(),
      status: getActivityStatus(steps, newActivity.currentStep || steps[0]?.title || "Activity Planning", newActivity.currentSubStep || ""),
      currentStep: newActivity.currentStep || steps[0]?.title || "Activity Planning",
      currentSubStep: newActivity.currentSubStep || steps.find((step) => step.title === (newActivity.currentStep || steps[0]?.title))?.subSteps?.[0] || "",
      stepRemarks: editingActivityId ? activities.find((item) => item.id === editingActivityId)?.stepRemarks ?? {} : {},
    };
    if (editingActivityId) {
      setActivities((current) => current.map((item) => item.id === editingActivityId ? { ...activity, id: editingActivityId } : item));
      setSelectedActivityId(editingActivityId);
      setNotice("Activity updated");
    } else {
      setActivities((current) => [activity, ...current]);
      setSelectedActivityId(activity.id);
      setNotice("Activity created");
    }
    if (databaseConfigured) {
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
      };
      if (editingActivityId) {
        void updateDatabaseActivity(editingActivityId, databaseValues).catch(() => setNotice("Activity updated locally; database update failed"));
      } else {
        void createDatabaseActivity({ program_id: program.id, activity_code: `ACT-${Date.now()}`, ...databaseValues }).then((created) => {
          setActivities((current) => current.map((item) => item.id === activity.id ? mapDatabaseActivity(created, steps) : item));
          setSelectedActivityId(created.id);
        }).catch(() => setNotice("Activity created locally; database insert failed"));
      }
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
  const deleteActivity = (id: string) => {
    setActivities((current) => current.filter((activity) => activity.id !== id));
    setSelectedActivityId("");
    setNotice("Activity deleted");
    if (databaseConfigured && !id.startsWith(`${program.id}-act-`)) {
      void deleteDatabaseActivity(id).catch(() => setNotice("Activity removed locally; database delete failed"));
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
  const saveActivityChanges = () => {
    if (!selectedActivity) return;
    const stepRemarks = { ...(selectedActivity.stepRemarks ?? {}) };
    activeSteps.forEach((step) => {
      const draftKey = `${selectedActivity.id}:${step.id}`;
      if (draftKey in remarkDrafts) stepRemarks[step.id] = remarkDrafts[draftKey];
    });
    setActivities((current) => current.map((activity) => activity.id === selectedActivity.id ? { ...activity, stepRemarks } : activity));
    if (databaseConfigured && !selectedActivity.id.startsWith(`${program.id}-act-`)) {
      const currentStepId = steps.find((step) => step.title === selectedActivity.currentStep)?.id ?? null;
      void updateDatabaseActivity(selectedActivity.id, {
        status: selectedActivity.status,
        current_step_id: currentStepId,
        current_sub_step: selectedActivity.currentSubStep ?? null,
        step_remarks: stepRemarks,
      }).catch(() => setNotice("Changes saved locally; database update failed"));
    }
    setNotice("Activity changes saved");
    setSaved(false);
  };
  const saveActivityDesign = () => {
    if (!selectedActivity || !canEdit) return;
    const activityDesign = selectedActivity.activityDesign ?? "";
    setActivities((current) => current.map((activity) => activity.id === selectedActivity.id ? { ...activity, activityDesign } : activity));
    if (databaseConfigured && !selectedActivity.id.startsWith(`${program.id}-act-`)) {
      void updateDatabaseActivity(selectedActivity.id, { activity_design: activityDesign }).catch(() => setNotice("Design saved locally; database update failed"));
    }
    setNotice("Activity design saved");
  };
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
  const confirmTimelineStepChange = () => {
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
    setActivities((currentActivities) => currentActivities.map((activity) => activity.id === selectedActivity.id
      ? { ...activity, completedSubSteps, currentStep: activeStep?.title ?? activity.currentStep, currentSubStep: activeSubStep, status: getActivityStatus(steps, activeStep?.title ?? activity.currentStep, activeSubStep) }
      : activity));
    setPendingTimelineStep(null);
    setPendingTimelineStep(null);
  };
  const navigateTo = (
    tab: "dashboard" | "programs" | "details" | "workflow" | "activities" | "settings" | "database",
    message: string,
  ) => {
    setActiveTab(tab);
    if (tab === "database") void loadDatabaseBrowser();
    setNotice(message);
  };
  const addOrganization = () => {
    if (!organizationDraft.trim()) return;
    setOrganizations((current) => [...current, organizationDraft.trim()]);
    setOrganizationDraft("");
    setNotice("Organization added");
  };
  if (authReady && (databaseConfigured ? !session : !localAuthenticated)) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={handleLogin}>
          <p className="eyebrow">DA-RFO-CAR</p>
          <h1>Welcome back</h1>
          <p>{databaseConfigured ? "Sign in to manage programs, activities, workflow steps, and collaboration." : "Local development mode. Use the seeded superadmin credentials or an account created by an admin."}</p>
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
              {systemRole === "superadmin" && <button
                className={activeTab === "database" ? "top-nav-item active" : "top-nav-item"}
                onClick={() => navigateTo("database", "Database browser opened")}
              >
                <Table2 size={14} /> Database
              </button>}
              {systemRole !== "superadmin" && <button
                className={
                  activeTab === "activities"
                    ? "top-nav-item active"
                    : "top-nav-item"
                }
                onClick={() => navigateTo("activities", "Activities opened")}
              >
                <Table2 size={14} /> Activities
              </button>}
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
            {(session || localAuthenticated) && <button className="button secondary" onClick={() => { if (databaseConfigured) void signOut(); else { window.localStorage.removeItem(localSessionKey); setLocalAuthenticated(false); } }}>Sign out</button>}
          </div>
        </header>
        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <p className="eyebrow">
                {activeTab === "dashboard" ? (systemRole === "superadmin" ? "System dashboard" : "Program dashboard") : activeTab === "programs" ? "Programs" : activeTab === "database" ? "Superadmin tools" : `${program.acronym} workspace`}
              </p>
              <h1>{activeTab === "dashboard" ? (systemRole === "superadmin" ? "System dashboard" : "Program dashboard") : activeTab === "programs" ? "Programs" : activeTab === "details" ? "Program details" : activeTab === "activities" ? "Activity register" : activeTab === "database" ? "Database browser" : "Settings"}</h1>
              <p className="page-intro">
                {activeTab === "dashboard" ? (systemRole === "superadmin" ? "Monitor all programs, activities, budgets, and user access." : "Monitor activity totals, utilization, and overdue work.") : activeTab === "programs" ? "Create programs, edit program details, and assign program administrators." : "Manage the program's operational sequence and fund-tracking rules."}
              </p>
            </div>
            <div className="heading-actions">
              <span className="draft-pill">
                <span /> {notice || "Unsaved changes"}
              </span>
              <button
                className="button primary"
                onClick={() => {
                  setSaved(true);
                  setNotice("Program changes saved");
                  setTimeout(() => setSaved(false), 2400);
                }}
              >
                <Save size={16} /> {saved ? "Saved" : "Save program"}
              </button>
            </div>
          </section>
          {activeTab === "dashboard" ? (
            <div className="dashboard-grid">
              <section className="dashboard-panel dashboard-program-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">{systemRole === "superadmin" ? "System portfolio" : "Program profile"}</p><h2>{systemRole === "superadmin" ? "All programs" : program.title}</h2></div><span className="dashboard-muted">{dashboardProgramCount} program{dashboardProgramCount === 1 ? "" : "s"}</span></div>{systemRole === "superadmin" ? <div className="superadmin-program-list">{programOptions.map((item) => <button className="superadmin-program-row" key={item.id} onClick={() => selectProgram(item.id)}><span className="program-summary-copy">{item.logo ? <img src={item.logo} alt="" /> : <ShieldCheck size={28} />}<span><strong>{item.acronym}</strong><small>{item.title}</small></span></span><span><b>{(activitiesByProgram[item.id] ?? []).length}</b><small>activities</small></span><ChevronDown size={17} /></button>)}</div> : <div className="program-summary"><div className="program-summary-copy">{program.logo ? <img src={program.logo} alt="" /> : <ShieldCheck size={28} />}<div><strong>{program.acronym}</strong><span>{program.agency}</span><span>{program.office}</span></div></div><div><small>Beneficiaries</small><strong>{program.beneficiaries}</strong></div><p>{program.description}</p></div>}</section>
              <div className="dashboard-card dashboard-total"><span className="dashboard-label">Total activities</span><strong>{dashboardTotals.activities}</strong><small>{systemRole === "superadmin" ? "Across all programs" : `Registered in ${program.acronym}`}</small></div>
              <div className="dashboard-card"><span className="dashboard-label">Approved budget</span><strong>₱{dashboardTotals.budget.toLocaleString()}</strong><small>Across all activities</small></div>
              <div className="dashboard-card"><span className="dashboard-label">Recorded spending</span><strong>₱{dashboardTotals.spent.toLocaleString()}</strong><small>{dashboardTotals.budget ? Math.round((dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}% utilized</small></div>
              <div className="dashboard-card dashboard-overdue"><span className="dashboard-label">Overdue activities</span><strong>{dashboardTotals.overdue}</strong><small>Past target end date</small></div>
              <section className="dashboard-panel dashboard-analytics-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">At a glance</p><h2>Activity portfolio</h2></div><span className="dashboard-muted">Live data</span></div><div className="dashboard-chart-grid"><div className="chart-block"><div className="chart-heading"><strong>Activities by status</strong><span>{dashboardTotals.activities} total</span></div><div className="status-bars">{dashboardStatusSummary.map((status) => <div className="status-bar-row" key={status.label}><span>{status.label}</span><div className="status-bar-track"><i className={status.className} style={{ width: `${dashboardTotals.activities ? (status.count / dashboardTotals.activities) * 100 : 0}%` }} /></div><b>{status.count}</b></div>)}</div></div><div className="chart-block budget-chart"><div className="chart-heading"><strong>Budget utilization</strong><span>{dashboardTotals.budget ? Math.round((dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}% used</span></div><div className="budget-gauge"><div className="budget-gauge-fill" style={{ width: `${dashboardTotals.budget ? Math.min(100, (dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}%` }} /></div><div className="budget-legend"><span><i className="legend-spent" /> Spent <b>₱{dashboardTotals.spent.toLocaleString()}</b></span><span><i className="legend-remaining" /> Remaining <b>₱{Math.max(0, dashboardTotals.budget - dashboardTotals.spent).toLocaleString()}</b></span></div></div></div></section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Needs attention</p><h2>Overdue activities</h2></div><button className="button secondary" onClick={() => navigateTo("activities", "Overdue activities opened")}>View activities</button></div>{dashboardActivities.filter((activity) => activity.endDate < today && activity.status !== "Completed").length ? <div className="overdue-list">{dashboardActivities.filter((activity) => activity.endDate < today && activity.status !== "Completed").map((activity) => <button className="overdue-row" key={activity.id} onClick={() => { setSelectedActivityId(activity.id); setShowActivityDialog(true); }}><span className="overdue-dot" /><span><strong>{activity.name}</strong><small>{activity.location} · Due {activity.endDate}</small></span><span className="status-tag status-revision">{activity.status}</span></button>)}</div> : <div className="empty-state"><Check size={20} /> No overdue activities</div>}</section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">{systemRole === "superadmin" ? "Portfolio activity" : "Program activity"}</p><h2>Current progress</h2></div><span className="dashboard-muted">{dashboardActivities.length} activities</span></div><div className="dashboard-progress-list">{dashboardActivities.slice(0, 5).map((activity) => <div className="dashboard-progress-row" key={activity.id}><div><strong>{activity.name}</strong><small>{getNumberedStep(steps, activity.currentStep)}</small></div><div className="dashboard-progress-bar"><span style={{ width: `${activity.budget ? Math.min(100, (activity.spent / activity.budget) * 100) : 0}%` }} /></div><b>{activity.budget ? Math.round((activity.spent / activity.budget) * 100) : 0}%</b></div>)}</div></section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Completed work</p><h2>Finished activities</h2></div><span className="dashboard-muted">{dashboardActivities.filter((activity) => activity.status === "Completed").length} finished</span></div>{dashboardActivities.filter((activity) => activity.status === "Completed").length ? <div className="finished-list">{dashboardActivities.filter((activity) => activity.status === "Completed").map((activity) => <button className="finished-row" key={activity.id} onClick={() => { setSelectedActivityId(activity.id); setShowActivityDialog(true); }}><span className="finished-check"><Check size={13} /></span><span><strong>{activity.name}</strong><small>{activity.location} · Finished {activity.endDate}</small></span><span className="status-tag status-completed">Completed</span></button>)}</div> : <div className="empty-state"><Check size={20} /> No finished activities</div>}</section>
            </div>
          ) : activeTab === "database" && systemRole === "superadmin" ? (
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
          ) : (
          <div className={`builder-layout ${activeTab === "activities" ? "activities-layout" : ""}`}>
            <section className="builder-panel">
              {activeTab === "programs" && !showProgramDetailDialog ? (
                <div className="programs-page">
                  <div className="section-title"><div><p className="eyebrow">Superadmin workspace</p><h2>All programs</h2><p>Select a program to view or edit its details.</p></div><button className="button primary" onClick={() => setShowProgramCreateDialog(true)}><Plus size={15} /> Create program</button></div>
                  <div className="programs-list">
                    {programOptions.map((item) => <button className={`program-list-row ${item.id === program.id ? "selected" : ""}`} key={item.id} onClick={() => { setProgram(item); setSteps(item.steps); setActivities(activitiesByProgram[item.id] ?? []); if (!databaseConfigured) setMembers(readLocalProgramMembers(item.id)); setProgramDialogEditing(false); setShowProgramDetailDialog(true); }}><span className="program-list-mark">{item.acronym.slice(0, 2)}</span><span><strong>{item.title}</strong><small>{item.acronym} · {item.agency}</small></span><span className="program-list-count">{(activitiesByProgram[item.id] ?? []).length} activities</span><ChevronDown size={18} /></button>)}
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
                    <div className="detail-actions">{!programDialogEditing && programDialogTab === "details" && <button className="button secondary" onClick={() => setProgramDialogEditing(true)}>Edit program</button>}{programDialogEditing && <button className="button primary" onClick={() => { setProgramDialogEditing(false); setNotice("Program details saved"); }}><Save size={14} /> Save</button>}<span className="step-number">01</span></div>
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
                  </> : <div className="program-admins-panel"><div className="section-title"><div><p className="eyebrow">Access management</p><h2>Program administrators</h2><p>View, edit, or revoke admin access for {program.acronym}.</p></div><button className="button primary" onClick={() => setShowProgramAdminDialog(true)}><Plus size={15} /> Add admin</button></div><div className="program-admin-list">{members.filter((member) => member.role === "program_admin").map((member) => <div className="settings-row" key={member.id}><span>{member.profile?.full_name ?? "Unnamed admin"}</span><small>{member.profile?.email}</small><b>Program admin</b><button className="icon-button" aria-label="Edit program admin" onClick={() => { setAccountForm({ email: member.profile?.email ?? "", fullName: member.profile?.full_name ?? "", password: "", role: "program_admin" }); setMemberDialog(member); }}><Settings size={15} /></button><button className="icon-button danger" aria-label="Delete program admin" onClick={() => void deleteMemberAccount(member)}><Trash2 size={15} /></button></div>)}{members.filter((member) => member.role === "program_admin").length === 0 && <div className="empty-state">No program admin account assigned yet.</div>}</div></div>}
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
                              <button className="icon-button danger" aria-label="Delete activity" onClick={() => deleteActivity(selectedActivity.id)}><Trash2 size={17} /></button>
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
                      <h2>Organization & fund workflow</h2>
                      <p>Maintain the reusable units and fund stages available to program administrators.</p>
                    </div>
                  </div>
                  <div className="settings-switcher">
                    {isAdmin && <button className={settingsSection === "organizations" ? "settings-switch active" : "settings-switch"} onClick={() => setSettingsSection("organizations")}>Users & organizations</button>}
                    <button className={settingsSection === "fund-workflow" ? "settings-switch active" : "settings-switch"} onClick={() => setSettingsSection("fund-workflow")}>Fund workflow</button>
                    {isAdmin && <button className={settingsSection === "audit" ? "settings-switch active" : "settings-switch"} onClick={() => setSettingsSection("audit")}>Audit log</button>}
                  </div>
                  {settingsSection === "organizations" && isAdmin ? (
                    <div className="settings-list">
                      {systemRole !== "superadmin" && <div className="member-invite">
                        <h3>Create program account</h3>
                        <div className="settings-create"><input value={accountForm.fullName} onChange={(event) => setAccountForm({ ...accountForm, fullName: event.target.value })} placeholder="Full name" /><input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} placeholder="Email address" /><input type="password" minLength={8} value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder="Temporary password" /><span className="account-role-label">Viewer for {program.acronym}</span><button className="button primary" onClick={() => void createAccount("viewer")}><Plus size={15} /> Create viewer</button></div>
                      </div>}
                      <h3>Program users</h3>
                      {members.map((member) => <div className="settings-row" key={member.id}><span>{member.profile?.full_name ?? member.profile?.email ?? member.user_id}</span><small>{member.profile?.email}</small><b>{member.role}</b><button className="icon-button" aria-label={`Edit ${member.profile?.full_name ?? "account"}`} onClick={() => { setAccountForm({ email: member.profile?.email ?? "", fullName: member.profile?.full_name ?? "", password: "", role: member.role === "program_admin" ? "program_admin" : "viewer" }); setMemberDialog(member); }}><Settings size={15} /></button><button className="icon-button danger" aria-label={`Delete ${member.profile?.full_name ?? "account"}`} onClick={() => void deleteMemberAccount(member)}><Trash2 size={15} /></button></div>)}
                      <h3>Organizations</h3>
                      <div className="settings-create"><input value={organizationDraft} onChange={(event) => setOrganizationDraft(event.target.value)} placeholder="Add organization or responsible unit" /><button className="button primary" onClick={addOrganization}><Plus size={15} /> Add</button></div>
                      {organizations.map((organization, index) => <div className="settings-row" key={`${organization}-${index}`}><span>{organization}</span><button className="icon-button danger" aria-label={`Delete ${organization}`} onClick={() => setOrganizations((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div>)}
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
                              if (!step.subSteps?.length) {
                                setSteps((current) => current.map((item) => item.id === step.id ? { ...item, subSteps: withSampleSubSteps([item])[0].subSteps } : item));
                              }
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
                <div className="program-create-grid"><input value={programForm.title} onChange={(event) => setProgramForm({ ...programForm, title: event.target.value })} placeholder="Program name" /><input value={programForm.acronym} onChange={(event) => setProgramForm({ ...programForm, acronym: event.target.value })} placeholder="Acronym" /><input value={programForm.agency} onChange={(event) => setProgramForm({ ...programForm, agency: event.target.value })} placeholder="Agency" /><input value={programForm.office} onChange={(event) => setProgramForm({ ...programForm, office: event.target.value })} placeholder="Office / subtitle" /><input value={programForm.beneficiaries} onChange={(event) => setProgramForm({ ...programForm, beneficiaries: event.target.value })} placeholder="Target beneficiaries" /><input value={programForm.units} onChange={(event) => setProgramForm({ ...programForm, units: event.target.value })} placeholder="Operating units" /><textarea value={programForm.description} onChange={(event) => setProgramForm({ ...programForm, description: event.target.value })} placeholder="Program description" rows={3} /><button className="button primary" onClick={() => void createProgramForSuperadmin()}><Plus size={15} /> Create program</button></div>
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

          {showProgramDetailDialog && showProgramAdminDialog && (
            <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setShowProgramAdminDialog(false); }}>
              <dialog open className="activity-dialog account-dialog">
                <div className="detail-heading"><div><p className="eyebrow">{program.acronym}</p><h2>Create program admin</h2><p className="detail-subtitle">This account will manage {program.title} and create its viewers.</p></div><button className="icon-button" aria-label="Close program admin dialog" onClick={() => setShowProgramAdminDialog(false)}><X size={17} /></button></div>
                <div className="account-dialog-form"><label>Full name<input value={accountForm.fullName} onChange={(event) => setAccountForm({ ...accountForm, fullName: event.target.value, role: "program_admin" })} placeholder="Program admin name" /></label><label>Email<input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value, role: "program_admin" })} placeholder="admin@example.com" /></label><label>Password<input type="password" minLength={8} value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value, role: "program_admin" })} placeholder="At least 8 characters" /></label><button className="button primary" onClick={() => void createAccount("program_admin").then(() => setShowProgramAdminDialog(false))}><Save size={14} /> Create admin account</button></div>
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
