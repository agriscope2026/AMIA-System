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
  List,
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
import { createActivity as createDatabaseActivity, createComment, createWorkflowStep, databaseConfigured, deleteActivity as deleteDatabaseActivity, getAuthSession, inviteProgramUser, loadActivities, loadAuditLogs, loadComments, loadMembers, loadPrograms, loadProfile, loadWorkflowSteps, signIn, signOut, subscribeToAuth, updateActivity as updateDatabaseActivity, updateProgram as updateDatabaseProgram, updateWorkflowStep } from "./lib/database";
import type { ActivityComment, AppProfile, AuditLog, ProgramMember } from "./lib/database";

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
  status: string;
  currentStep: string;
  currentSubStep?: string;
  stepRemarks?: Record<string, string>;
};

type LocalDraftState = {
  programOptions: ProgramConfig[];
  program: ProgramConfig;
  steps: WorkflowStep[];
  activities: Activity[];
  organizations: string[];
  comments?: ActivityComment[];
};

const localDraftKey = "da-rfo-car-tracking-draft";

function readLocalDraft(): Partial<LocalDraftState> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(localDraftKey) ?? "{}");
  } catch {
    return {};
  }
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
    steps: amiaWorkflow,
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
    steps: fourKWorkflow,
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
  status: getActivityStatus(steps, steps.find((step) => step.id === activity.current_step_id)?.title ?? steps[0]?.title ?? "", activity.current_sub_step ?? ""),
  currentStep: steps.find((step) => step.id === activity.current_step_id)?.title ?? steps[0]?.title ?? "",
  currentSubStep: activity.current_sub_step ?? "",
  stepRemarks: activity.step_remarks ?? {},
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
  const [programOptions, setProgramOptions] = useState<ProgramConfig[]>(localDraft.programOptions ?? samplePrograms);
  const [program, setProgram] = useState<ProgramConfig>(localDraft.program ?? samplePrograms[0]);
  const [steps, setSteps] = useState<WorkflowStep[]>(
    localDraft.steps ?? amiaWorkflow.map((step) => ({
      ...step,
      subSteps: step.subSteps ?? [
        `Prepare ${step.title}`,
        `Complete ${step.title}`,
        `Record ${step.title} outcome`,
      ],
    })),
  );
  const [activities, setActivities] = useState<Activity[]>(
    localDraft.activities ?? sampleActivities.amia,
  );
  const [selectedId, setSelectedId] = useState("amia-procurement");
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [stepDialogEditing, setStepDialogEditing] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState("amia-act-1");
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [session, setSession] = useState<Awaited<ReturnType<typeof getAuthSession>>>(null);
  const [authReady, setAuthReady] = useState(!databaseConfigured);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [programRole, setProgramRole] = useState<ProgramMember["role"]>(databaseConfigured ? "viewer" : "admin");
  const [members, setMembers] = useState<ProgramMember[]>([]);
  const [comments, setComments] = useState<ActivityComment[]>(localDraft.comments ?? []);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", role: "editor" as "editor" | "viewer" });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "details" | "workflow" | "activities" | "settings"
  >("dashboard");
  const [settingsSection, setSettingsSection] = useState<"organizations" | "fund-workflow" | "audit">("organizations");
  const [organizations, setOrganizations] = useState(localDraft.organizations ?? ["AMIA Program Unit", "Procurement Management Unit", "Budget and Finance Division"]);
  const [organizationDraft, setOrganizationDraft] = useState("");
  const [activityView, setActivityView] = useState<"timeline" | "table">(
    "table",
  );
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
    status: "Planning" as Activity["status"],
    currentStep: "",
    currentSubStep: "",
  });
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const activeSteps = useMemo(
    () => steps.filter((step) => step.active),
    [steps],
  );
  const selectedStep = steps.find((step) => step.id === selectedId) ?? steps[0];
  const today = new Date().toISOString().slice(0, 10);
  const dashboardTotals = useMemo(() => ({
    activities: activities.length,
    budget: activities.reduce((total, activity) => total + activity.budget, 0),
    spent: activities.reduce((total, activity) => total + activity.spent, 0),
    overdue: activities.filter((activity) => activity.endDate < today && activity.status !== "Completed").length,
  }), [activities, today]);
  const dashboardStatusSummary = useMemo(() => {
    const counts = new Map<string, number>();
    activities.forEach((activity) => counts.set(activity.status, (counts.get(activity.status) ?? 0) + 1));
    return Array.from(counts, ([label, count]) => ({ label, count, className: label === "Completed" ? "status-completed" : "status-progress" }));
  }, [activities]);

  useEffect(() => {
    if (databaseConfigured) return;
    window.localStorage.setItem(localDraftKey, JSON.stringify({
      programOptions,
      program,
      steps,
      activities,
      organizations,
      comments,
    } satisfies LocalDraftState));
  }, [activities, comments, organizations, program, programOptions, steps]);

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
    void loadProfile(session.user.id).then(setProfile).catch(() => setProfile({ id: session.user.id, full_name: session.user.email ?? "User", email: session.user.email ?? "" }));
  }, [session]);

  useEffect(() => {
    if (!databaseConfigured || !session?.user || !program.id) return;
    void loadMembers(program.id).then((loadedMembers) => {
      setMembers(loadedMembers);
      setProgramRole(loadedMembers.find((member) => member.user_id === session.user.id)?.role ?? "viewer");
    }).catch(() => setMembers([]));
    void loadAuditLogs(program.id).then(setAuditLogs).catch(() => setAuditLogs([]));
  }, [program.id, session]);

  useEffect(() => {
    if (!selectedActivityId || !databaseConfigured || !session) return;
    void loadComments(selectedActivityId).then(setComments).catch(() => setComments([]));
  }, [selectedActivityId, session]);

  const canEdit = !databaseConfigured || programRole === "admin" || programRole === "editor";
  const canComment = !databaseConfigured || Boolean(session);
  const isAdmin = !databaseConfigured || programRole === "admin";
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");
    try {
      await signIn(loginEmail.trim(), loginPassword);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to sign in");
    }
  };
  const addComment = async (activityId: string, stepId: string | null, parentId: string | null = null) => {
    const body = commentDrafts[`${activityId}:${stepId ?? "activity"}:${parentId ?? "root"}`]?.trim();
    if (!body) return;
    if (databaseConfigured && session) {
      try {
        const created = await createComment({ activity_id: activityId, step_id: stepId, parent_id: parentId, author_id: session.user.id, body });
        setComments((current) => [...current, created]);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not add comment");
        return;
      }
    } else {
      const created: ActivityComment = { id: `comment-${crypto.randomUUID()}`, activity_id: activityId, step_id: stepId, parent_id: parentId, author_id: "local-admin", body, created_at: new Date().toISOString(), author: { id: "local-admin", full_name: profile?.full_name ?? "Local admin", email: profile?.email ?? "" } };
      setComments((current) => [...current, created]);
    }
    setCommentDrafts((current) => ({ ...current, [`${activityId}:${stepId ?? "activity"}:${parentId ?? "root"}`]: "" }));
  };
  const renderStepComments = (activityId: string, stepId: string) => {
    const rootComments = comments.filter((comment) => comment.activity_id === activityId && comment.step_id === stepId && !comment.parent_id);
    return (
      <div className="comment-thread">
        <strong>Comments</strong>
        {rootComments.map((comment) => (
          <div className="comment-item" key={comment.id}>
            <div><b>{comment.author?.full_name ?? "User"}</b><small>{new Date(comment.created_at).toLocaleString()}</small></div>
            <p>{comment.body}</p>
            {comments.filter((reply) => reply.parent_id === comment.id).map((reply) => <div className="comment-reply" key={reply.id}><b>{reply.author?.full_name ?? "User"}</b><p>{reply.body}</p></div>)}
            {canComment && <div className="comment-compose compact"><input value={commentDrafts[`${activityId}:${stepId}:${comment.id}`] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [`${activityId}:${stepId}:${comment.id}`]: event.target.value }))} placeholder="Reply" /><button className="button secondary" onClick={() => void addComment(activityId, stepId, comment.id)}>Reply</button></div>}
          </div>
        ))}
        {canComment && <div className="comment-compose"><input value={commentDrafts[`${activityId}:${stepId}:root`] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [`${activityId}:${stepId}:root`]: event.target.value }))} placeholder="Add a comment for this step" /><button className="button secondary" onClick={() => void addComment(activityId, stepId)}>Comment</button></div>}
      </div>
    );
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
        const first = options[0];
        const firstActivities = await loadActivities(first.id);
        if (!mounted) return;
        setProgramOptions(options);
        setProgram(first);
        setSteps(first.steps);
        setActivities(firstActivities.map((activity) => mapDatabaseActivity(activity, first.steps)));
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
    setSteps((current) =>
      current.map((step) =>
        step.id === selectedId ? { ...step, [field]: value } : step,
      ),
    );
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
      setSteps((current) => [...current, draftStep]);
      setSelectedId(id);
    }
    setActiveTab("settings");
    setSettingsSection("fund-workflow");
    setStepDialogEditing(true);
    setShowStepDialog(true);
    setSaved(false);
  };
  const stepsWithSubSteps = (workflow: WorkflowStep[]) =>
    workflow.map((step) => ({
      ...step,
      subSteps:
        step.subSteps && step.subSteps.length > 0
          ? [...step.subSteps]
          : [
              `Prepare ${step.title}`,
              `Complete ${step.title}`,
              `Record ${step.title} outcome`,
            ],
    }));
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
    setSteps(stepsWithSubSteps(nextProgram.steps));
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
    });
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
  const selectedActivitySubStep = selectedActivity?.currentSubStep || selectedActivityStep?.subSteps?.[0] || "";
  const updateActivityStatus = (currentStep: string, currentSubStep = selectedActivity?.currentSubStep ?? "") => {
    if (!selectedActivity) return;
    const status = getActivityStatus(steps, currentStep, currentSubStep);
    setActivities((current) =>
      current.map((activity) =>
        activity.id === selectedActivity.id
          ? { ...activity, status, currentStep, currentSubStep }
          : activity,
      ),
    );
    setSaved(false);
  };
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
  const navigateTo = (
    tab: "dashboard" | "details" | "workflow" | "activities" | "settings",
    message: string,
  ) => {
    setActiveTab(tab);
    setNotice(message);
  };
  const addOrganization = () => {
    if (!organizationDraft.trim()) return;
    setOrganizations((current) => [...current, organizationDraft.trim()]);
    setOrganizationDraft("");
    setNotice("Organization added");
  };
  if (databaseConfigured && authReady && !session) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={handleLogin}>
          <p className="eyebrow">DA-RFO-CAR</p>
          <h1>Program workspace</h1>
          <p>Sign in to manage programs, activities, workflow steps, and collaboration.</p>
          <label>Email<input type="email" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
          <label>Password<input type="password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
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
            <strong className="current-program-label">{program.acronym} · {program.title}</strong>
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
            <label className="program-switcher">
              <span>Editing</span>
              <select
                value={program.id}
                onChange={(event) => selectProgram(event.target.value)}
                aria-label="Select sample program"
              >
                {programOptions.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.acronym} - {sample.title}
                  </option>
                ))}
              </select>
            </label>
            <button
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
            </button>
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
              onClick={() => { setActiveTab("details"); setProfileOpen(true); }}
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
                {activeTab === "dashboard" ? "Program dashboard" : `${program.acronym} workspace`}
              </p>
              <h1>{activeTab === "dashboard" ? "Program dashboard" : activeTab === "details" ? "Program details" : activeTab === "activities" ? "Activity register" : "Settings"}</h1>
              <p className="page-intro">
                {activeTab === "dashboard" ? "Monitor activity totals, utilization, and overdue work." : "Manage the program's operational sequence and fund-tracking rules."}
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
              <section className="dashboard-panel dashboard-program-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Program profile</p><h2>{program.title}</h2></div></div><div className="program-summary"><div className="program-summary-copy">{program.logo ? <img src={program.logo} alt="" /> : <ShieldCheck size={28} />}<div><strong>{program.acronym}</strong><span>{program.agency}</span><span>{program.office}</span></div></div><div><small>Beneficiaries</small><strong>{program.beneficiaries}</strong></div><p>{program.description}</p></div></section>
              <div className="dashboard-card dashboard-total"><span className="dashboard-label">Total activities</span><strong>{dashboardTotals.activities}</strong><small>Registered in {program.acronym}</small></div>
              <div className="dashboard-card"><span className="dashboard-label">Approved budget</span><strong>₱{dashboardTotals.budget.toLocaleString()}</strong><small>Across all activities</small></div>
              <div className="dashboard-card"><span className="dashboard-label">Recorded spending</span><strong>₱{dashboardTotals.spent.toLocaleString()}</strong><small>{dashboardTotals.budget ? Math.round((dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}% utilized</small></div>
              <div className="dashboard-card dashboard-overdue"><span className="dashboard-label">Overdue activities</span><strong>{dashboardTotals.overdue}</strong><small>Past target end date</small></div>
              <section className="dashboard-panel dashboard-analytics-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">At a glance</p><h2>Activity portfolio</h2></div><span className="dashboard-muted">Live data</span></div><div className="dashboard-chart-grid"><div className="chart-block"><div className="chart-heading"><strong>Activities by status</strong><span>{dashboardTotals.activities} total</span></div><div className="status-bars">{dashboardStatusSummary.map((status) => <div className="status-bar-row" key={status.label}><span>{status.label}</span><div className="status-bar-track"><i className={status.className} style={{ width: `${dashboardTotals.activities ? (status.count / dashboardTotals.activities) * 100 : 0}%` }} /></div><b>{status.count}</b></div>)}</div></div><div className="chart-block budget-chart"><div className="chart-heading"><strong>Budget utilization</strong><span>{dashboardTotals.budget ? Math.round((dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}% used</span></div><div className="budget-gauge"><div className="budget-gauge-fill" style={{ width: `${dashboardTotals.budget ? Math.min(100, (dashboardTotals.spent / dashboardTotals.budget) * 100) : 0}%` }} /></div><div className="budget-legend"><span><i className="legend-spent" /> Spent <b>₱{dashboardTotals.spent.toLocaleString()}</b></span><span><i className="legend-remaining" /> Remaining <b>₱{Math.max(0, dashboardTotals.budget - dashboardTotals.spent).toLocaleString()}</b></span></div></div></div></section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Needs attention</p><h2>Overdue activities</h2></div><button className="button secondary" onClick={() => navigateTo("activities", "Overdue activities opened")}>View activities</button></div>{activities.filter((activity) => activity.endDate < today && activity.status !== "Completed").length ? <div className="overdue-list">{activities.filter((activity) => activity.endDate < today && activity.status !== "Completed").map((activity) => <button className="overdue-row" key={activity.id} onClick={() => { setSelectedActivityId(activity.id); setShowActivityDialog(true); }}><span className="overdue-dot" /><span><strong>{activity.name}</strong><small>{activity.location} · Due {activity.endDate}</small></span><span className="status-tag status-revision">{activity.status}</span></button>)}</div> : <div className="empty-state"><Check size={20} /> No overdue activities</div>}</section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Program activity</p><h2>Current progress</h2></div><span className="dashboard-muted">{activities.length} activities</span></div><div className="dashboard-progress-list">{activities.slice(0, 5).map((activity) => <div className="dashboard-progress-row" key={activity.id}><div><strong>{activity.name}</strong><small>{getNumberedStep(steps, activity.currentStep)}</small></div><div className="dashboard-progress-bar"><span style={{ width: `${activity.budget ? Math.min(100, (activity.spent / activity.budget) * 100) : 0}%` }} /></div><b>{activity.budget ? Math.round((activity.spent / activity.budget) * 100) : 0}%</b></div>)}</div></section>
              <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Completed work</p><h2>Finished activities</h2></div><span className="dashboard-muted">{activities.filter((activity) => activity.status === "Completed").length} finished</span></div>{activities.filter((activity) => activity.status === "Completed").length ? <div className="finished-list">{activities.filter((activity) => activity.status === "Completed").map((activity) => <button className="finished-row" key={activity.id} onClick={() => { setSelectedActivityId(activity.id); setShowActivityDialog(true); }}><span className="finished-check"><Check size={13} /></span><span><strong>{activity.name}</strong><small>{activity.location} · Finished {activity.endDate}</small></span><span className="status-tag status-completed">Completed</span></button>)}</div> : <div className="empty-state"><Check size={20} /> No finished activities</div>}</section>
            </div>
          ) : (
          <div className={`builder-layout ${activeTab === "activities" ? "activities-layout" : ""}`}>
            <section className="builder-panel">
              {activeTab === "details" ? (
                <div className="dialog-overlay" onClick={(event) => { if (event.target !== event.currentTarget) return; setProfileOpen(false); setActiveTab("dashboard"); }}>
                <dialog open={profileOpen} className="form-section profile-dialog">
                  <div className="section-title">
                    <div>
                      <p className="eyebrow">User profile</p>
                      <h2>Program details</h2>
                      <p>
                        Make this workspace recognizable to every operating
                        unit.
                      </p>
                    </div>
                    <span className="step-number">01</span>
                  </div>
                  <button className="icon-button profile-dialog-close" aria-label="Close program details" onClick={() => { setProfileOpen(false); setActiveTab("dashboard"); }}><X size={17} /></button>
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
                        onChange={(e) => updateProgram("title", e.target.value)}
                      />
                    </label>
                    <label>
                      Acronym
                      <input
                        value={program.acronym}
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
                        onChange={(e) =>
                          updateProgram("agency", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Regional office / subtitle
                      <input
                        value={program.office}
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
                        onChange={(e) =>
                          updateProgram("beneficiaries", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Operating units / divisions
                      <input
                        value={program.units}
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
                            setNewActivity({ name: "", location: "", startDate: "", endDate: "", budget: "", spent: "0", status: "Planning", currentStep: steps[0]?.title ?? "", currentSubStep: steps[0]?.subSteps?.[0] ?? "" });
                            setShowActivityForm(true);
                          }}
                      >
                          <Plus size={16} /> {editingActivityId ? "Edit activity" : "Create activity"}
                      </button>}
                  </div>
                  <div className="activity-tabs" role="tablist" aria-label="Activity views">
                    <button className={activityView === "timeline" ? "activity-view active" : "activity-view"} onClick={() => setActivityView("timeline")}>
                      <List size={15} /> Timeline
                    </button>
                    <button className={activityView === "table" ? "activity-view active" : "activity-view"} onClick={() => setActivityView("table")}>
                      <Table2 size={15} /> Activity table
                    </button>
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
                            onClick={() => { setSelectedActivityId(activity.id); setShowActivityDialog(true); }}
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
                        <dialog open className="activity-detail activity-dialog">
                          <div className="detail-heading">
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
                          <div className="fund-summary">
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
                          <div className="timeline">
                            {activeSteps.map((step, index) => {
                              const currentStepIndex = activeSteps.findIndex((item) => item.title === selectedActivity.currentStep);
                              const stepDone = index < currentStepIndex || selectedActivity.status === "Completed";
                              const stepCurrent = index === currentStepIndex && selectedActivity.status !== "Completed";
                              const currentSubStepIndex = (step.subSteps ?? []).indexOf(selectedActivity.currentSubStep ?? "");
                              return (
                              <div
                                className={`timeline-step ${stepDone ? "complete" : "pending"} ${stepCurrent ? "current" : ""}`}
                                key={step.id}
                              >
                                <div className="timeline-marker">
                                  {stepDone ? (
                                    <Check size={12} />
                                  ) : (
                                    index + 1
                                  )}
                                </div>
                                <div>
                                  <strong>{index + 1}. {step.title}</strong>
                                  <small>
                                    {stepCurrent
                                      ? "Current activity stage"
                                      : stepDone
                                        ? "Completed"
                                        : `Target SLA · ${step.slaDays} days`}
                                  </small>
                                  {(step.subSteps ?? []).map((subStep, subStepIndex) => {
                                    const subStepDone = stepDone || (stepCurrent && subStepIndex < currentSubStepIndex) || selectedActivity.status === "Completed";
                                    const subStepCurrent = stepCurrent && subStepIndex === currentSubStepIndex;
                                    return <div className={`timeline-substep ${subStepDone ? "complete" : "pending"} ${subStepCurrent ? "current" : ""}`} key={subStep}>
                                      <span className="substep-circle">{subStepDone ? <Check size={10} /> : ""}</span>
                                      <em>{index + 1}.{subStepIndex + 1} {subStep}</em>
                                    </div>;
                                  })}
                                  {canEdit && <label className="step-remark-field">
                                    <span>Admin remark</span>
                                    <textarea
                                      value={remarkDrafts[`${selectedActivity.id}:${step.id}`] ?? selectedActivity.stepRemarks?.[step.id] ?? ""}
                                      onChange={(event) => setRemarkDrafts((current) => ({ ...current, [`${selectedActivity.id}:${step.id}`]: event.target.value }))}
                                      placeholder="Add a note about this step"
                                      rows={2}
                                    />
                                  </label>}
                                  {renderStepComments(selectedActivity.id, step.id)}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                          <div className="activity-status-actions">
                            <span>Step</span>
                            <select disabled={!canEdit} value={selectedActivity.currentStep} onChange={(event) => updateActivityStatus(event.target.value, steps.find((step) => step.title === event.target.value)?.subSteps?.[0] ?? "")}>
                              {activeSteps.map((step, index) => <option key={step.id} value={step.title}>{index + 1}. {step.title}</option>)}
                            </select>
                            <span>Sub-step</span>
                            <select disabled={!canEdit} value={selectedActivitySubStep} onChange={(event) => updateActivityStatus(selectedActivity.currentStep, event.target.value)}>
                              {(steps.find((step) => step.title === selectedActivity.currentStep)?.subSteps ?? []).map((subStep, index) => <option key={subStep} value={subStep}>{(activeSteps.findIndex((step) => step.title === selectedActivity.currentStep) + 1)}.{index + 1} {subStep}</option>)}
                            </select>
                            {canEdit && <button className="button primary" onClick={saveActivityChanges}><Save size={14} /> Save changes</button>}
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
                                setActivityView("timeline");
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
                      <div className="member-invite">
                        <h3>Invite program user</h3>
                        <div className="settings-create"><input value={inviteForm.fullName} onChange={(event) => setInviteForm({ ...inviteForm, fullName: event.target.value })} placeholder="Full name" /><input type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder="Email address" /><select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value as "editor" | "viewer" })}><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button className="button primary" onClick={() => void inviteProgramUser(program.id, inviteForm.email, inviteForm.fullName, inviteForm.role).then(() => { setNotice("Invitation sent"); setInviteForm({ email: "", fullName: "", role: "editor" }); return loadMembers(program.id).then(setMembers); }).catch((error) => setNotice(error instanceof Error ? error.message : "Could not send invitation"))}><Plus size={15} /> Invite</button></div>
                      </div>
                      <h3>Program users</h3>
                      {members.map((member) => <div className="settings-row" key={member.id}><span>{member.profile?.full_name ?? member.profile?.email ?? member.user_id}</span><small>{member.profile?.email}</small><b>{member.role}</b></div>)}
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
                          <p>Manage the reusable steps used to track activities from planning through liquidation.</p>
                        </div>
                        {isAdmin && <button className="button secondary" onClick={addStep}><Plus size={16} /> Add step</button>}
                      </div>
                      <div className="workflow-list">
                        {steps.map((step, index) => (
                          <button
                            key={step.id}
                            className={`workflow-row ${selectedId === step.id ? "selected" : ""} ${!step.active ? "inactive" : ""}`}
                            onClick={() => { setSelectedId(step.id); setStepDialogEditing(canEdit); setShowStepDialog(true); }}
                          >
                            <GripVertical size={17} className="drag-icon" />
                            <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                            <span className="row-content">
                              <strong>{step.title}</strong>
                              <small>{step.assignedRole} <span>•</span> {step.slaDays} days SLA</small>
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
