import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// App bootstrap
// ------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

// ------------------------------------------------------------
// File upload
// ------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = (file.originalname || "file").replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${nanoid(6)}-${safeName}`);
  }
});

const allowedExtensions = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".zip"
];

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedExtensions.includes(ext)) return cb(null, true);
    return cb(new Error("Unsupported file type"));
  }
});

// ------------------------------------------------------------
// MongoDB
// ------------------------------------------------------------
async function connectDB() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in environment variables");
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
    await seedDefaultLead();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

// ------------------------------------------------------------
// Project lifecycle config
// ------------------------------------------------------------
const PROJECT_LIFECYCLE = [
  "Upstream",
  "Proposal",
  "PO Received",
  "Kickoff",
  "Planning",
  "Design",
  "Development",
  "Testing",
  "Deployment",
  "Completed",
  "Closed / Archived"
];

const WORKFLOW_RULES = {
  "Upstream": {
    next: ["Proposal"],
    allowedRoles: ["lead"],
    requiredFields: [],
    approvalRequired: false,
    autoMilestone: "Opportunity Qualified"
  },
  "Proposal": {
    next: ["PO Received"],
    allowedRoles: ["lead"],
    requiredFields: ["proposalDocument", "estimatedBudget"],
    approvalRequired: false,
    autoMilestone: "Proposal Submitted"
  },
  "PO Received": {
    next: ["Kickoff"],
    allowedRoles: ["lead"],
    requiredFields: ["poNumber", "customerConfirmation"],
    approvalRequired: false,
    autoMilestone: "PO Received"
  },
  "Kickoff": {
    next: ["Planning"],
    allowedRoles: ["lead"],
    requiredFields: ["kickoffDate", "scopeSignoff"],
    approvalRequired: false,
    autoMilestone: "Kickoff Completed"
  },
  "Planning": {
    next: ["Design"],
    allowedRoles: ["lead"],
    requiredFields: ["projectPlanApproved", "resourceAllocationDone"],
    approvalRequired: false,
    autoMilestone: "Planning Completed"
  },
  "Design": {
    next: ["Development"],
    allowedRoles: ["lead"],
    requiredFields: ["designApproved"],
    approvalRequired: false,
    autoMilestone: "Design Approved"
  },
  "Development": {
    next: ["Testing"],
    allowedRoles: ["lead"],
    requiredFields: ["devComplete"],
    approvalRequired: false,
    autoMilestone: "Development Completed"
  },
  "Testing": {
    next: ["Deployment"],
    allowedRoles: ["lead"],
    requiredFields: ["qaSignoff"],
    approvalRequired: true,
    autoMilestone: "QA Approved"
  },
  "Deployment": {
    next: ["Completed"],
    allowedRoles: ["lead"],
    requiredFields: ["deploymentDate", "handoverNotes"],
    approvalRequired: false,
    autoMilestone: "Deployment Completed"
  },
  "Completed": {
    next: ["Closed / Archived"],
    allowedRoles: ["lead"],
    requiredFields: ["closureNotes", "lessonsLearned"],
    approvalRequired: false,
    autoMilestone: "Project Completed"
  },
  "Closed / Archived": {
    next: [],
    allowedRoles: ["lead"],
    requiredFields: [],
    approvalRequired: false,
    autoMilestone: null
  }
};

// ------------------------------------------------------------
// Schemas
// ------------------------------------------------------------
const ProjectSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  name: { type: String, required: true },
  code: { type: String, default: "" },
  description: { type: String, default: "" },
  ownerId: { type: String, default: "" },
  memberIds: { type: [String], default: [] },

  status: {
    type: String,
    enum: ["active", "paused", "completed", "archived"],
    default: "active"
  },

  lifecycleStage: {
    type: String,
    enum: PROJECT_LIFECYCLE,
    default: "Upstream"
  },

  stageUpdatedAt: { type: Date, default: Date.now },
  stageUpdatedBy: { type: String, default: "" },

  transitionHistory: {
    type: [{
      from: { type: String, default: null },
      to: { type: String, required: true },
      by: { type: String, default: "" },
      at: { type: Date, default: Date.now },
      note: { type: String, default: "" }
    }],
    default: []
  },

  approvals: {
    type: [{
      stage: { type: String, default: "" },
      approvedBy: { type: String, default: "" },
      approvedAt: { type: Date, default: null },
      status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
      note: { type: String, default: "" }
    }],
    default: []
  },

  workflowData: {
    proposalDocument: { type: String, default: "" },
    estimatedBudget: { type: String, default: "" },
    poNumber: { type: String, default: "" },
    customerConfirmation: { type: Boolean, default: false },
    kickoffDate: { type: String, default: "" },
    scopeSignoff: { type: Boolean, default: false },
    projectPlanApproved: { type: Boolean, default: false },
    resourceAllocationDone: { type: Boolean, default: false },
    designApproved: { type: Boolean, default: false },
    devComplete: { type: Boolean, default: false },
    qaSignoff: { type: Boolean, default: false },
    deploymentDate: { type: String, default: "" },
    handoverNotes: { type: String, default: "" },
    closureNotes: { type: String, default: "" },
    lessonsLearned: { type: String, default: "" }
  }
}, { timestamps: true });

const ProjectSummarySchema = new mongoose.Schema({
  projectId: { type: String, unique: true, index: true, required: true },
  projectName: { type: String, default: "" },
  projectOwner: { type: String, default: "" },
  currentPhase: { type: String, default: "Upstream" },
  targetRelease: { type: String, default: "" },
  overallStatus: { type: String, default: "on-track" },
  vision: { type: String, default: "" },
  weeklyFocus: { type: String, default: "" },
  launchGoal: { type: String, default: "" },
  risks: { type: mongoose.Schema.Types.Mixed, default: [] },
  roadmap: { type: mongoose.Schema.Types.Mixed, default: [] }
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  name: { type: String, required: true },
  username: { type: String, unique: true, index: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "member" },
  module: { type: String, default: "General" }
}, { timestamps: true });

const TaskSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  projectId: { type: String, default: "", index: true },
  title: { type: String, required: true },
  priority: { type: String, default: "medium" },
  module: { type: String, default: "General" },
  assigneeId: { type: String, default: "" },
  status: { type: String, default: "todo" },
  creatorId: { type: String, default: "" },
  dueDate: { type: String, default: "" },
  deadline: { type: String, default: "" },
  description: { type: String, default: "" }
}, { timestamps: true });

const FeedSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  projectId: { type: String, default: "", index: true },
  userId: { type: String, default: "" },
  userName: { type: String, default: "Unknown" },
  module: { type: String, default: "General" },
  content: { type: String, required: true },
  progress: { type: Number, default: 0 },
  blockers: { type: String, default: "" },
  creatorId: { type: String, default: "" },
  timestamp: { type: String, default: "" }
}, { timestamps: true });

const MilestoneSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  projectId: { type: String, default: "", index: true },
  title: { type: String, required: true },
  date: { type: String, default: "" },
  progress: { type: Number, default: 0 },
  description: { type: String, default: "" },
  creatorId: { type: String, default: "" }
}, { timestamps: true });

const DocSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  projectId: { type: String, default: "", index: true },
  title: { type: String, required: true },
  url: { type: String, default: "" },
  fileName: { type: String, default: "" },
  fileUrl: { type: String, default: "" },
  fileType: { type: String, default: "" },
  fileSize: { type: Number, default: 0 },
  uploadedBy: { type: String, default: "" },
  creatorId: { type: String, default: "" }
}, { timestamps: true });

const MeetingSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  projectId: { type: String, default: "", index: true },
  title: { type: String, required: true },
  date: { type: String, default: "" },
  startAt: { type: String, default: "" },
  endAt: { type: String, default: "" },
  notes: { type: String, default: "" },
  location: { type: String, default: "" },
  link: { type: String, default: "" },
  creatorId: { type: String, default: "" }
}, { timestamps: true });

const ChatSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  projectId: { type: String, default: "", index: true },
  userId: { type: String, default: "" },
  userName: { type: String, default: "Unknown" },
  message: { type: String, required: true },
  seenBy: { type: [String], default: [] },
  creatorId: { type: String, default: "" },
  timestamp: { type: String, default: "" }
}, { timestamps: true });

const NotificationSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  projectId: { type: String, default: "", index: true },
  userId: { type: String, default: "all" },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  deletedBy: { type: [String], default: [] },
  creatorId: { type: String, default: "" },
  timestamp: { type: String, default: "" }
}, { timestamps: true });

const AttendanceSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  date: { type: String, required: true },
  checkIn: { type: String, default: "" },
  checkOut: { type: String, default: "" },
  status: { type: String, default: "Present" },
  summary: { type: String, default: "" },
  creatorId: { type: String, default: "" }
}, { timestamps: true });

const DeadlineSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  projectId: { type: String, default: "", index: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  dueDate: { type: String, required: true },
  priority: { type: String, default: "medium" },
  status: { type: String, default: "pending" },
  assignedTo: { type: String, default: "" },
  creatorId: { type: String, default: "" }
}, { timestamps: true });

// ------------------------------------------------------------
// Models
// ------------------------------------------------------------
const Project = mongoose.model("Project", ProjectSchema);
const ProjectSummary = mongoose.model("ProjectSummary", ProjectSummarySchema);
const User = mongoose.model("User", UserSchema);
const Task = mongoose.model("Task", TaskSchema);
const Feed = mongoose.model("Feed", FeedSchema);
const Milestone = mongoose.model("Milestone", MilestoneSchema);
const Doc = mongoose.model("Doc", DocSchema);
const Meeting = mongoose.model("Meeting", MeetingSchema);
const Chat = mongoose.model("Chat", ChatSchema);
const Notification = mongoose.model("Notification", NotificationSchema);
const Attendance = mongoose.model("Attendance", AttendanceSchema);
const Deadline = mongoose.model("Deadline", DeadlineSchema);

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function stripMongo(doc) {
  if (!doc) return doc;
  const { _id, __v, passwordHash, ...rest } = doc;
  return rest;
}

function safeUser(user) {
  return stripMongo(user);
}

function normalizeTask(task) {
  const clean = stripMongo(task);
  if (!clean) return clean;
  return {
    ...clean,
    deadline: clean.deadline || clean.dueDate || "",
    dueDate: clean.dueDate || clean.deadline || ""
  };
}

function normalizeMeeting(meeting) {
  const clean = stripMongo(meeting);
  if (!clean) return clean;
  return {
    ...clean,
    startAt: clean.startAt || clean.date || "",
    date: clean.date || clean.startAt || ""
  };
}

function isValuePresent(value) {
  if (typeof value === "boolean") return value === true;
  if (typeof value === "number") return true;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getMissingRequiredFields(project, nextStage, incomingWorkflowData = {}) {
  const rule = WORKFLOW_RULES[nextStage];
  if (!rule) return [];
  const merged = { ...(project.workflowData || {}), ...(incomingWorkflowData || {}) };
  return (rule.requiredFields || []).filter((field) => !isValuePresent(merged[field]));
}

function getNextLifecycleStage(currentStage) {
  const rule = WORKFLOW_RULES[currentStage];
  if (!rule || !Array.isArray(rule.next) || !rule.next.length) return null;
  return rule.next[0];
}

async function syncProjectSummaryFromStage(project) {
  const currentIndex = PROJECT_LIFECYCLE.indexOf(project.lifecycleStage);
  const roadmap = PROJECT_LIFECYCLE.map((phase, index) => ({
    id: `roadmap_${index + 1}`,
    phase,
    status: index < currentIndex ? "done" : index === currentIndex ? "doing" : "todo",
    start: "",
    end: "",
    description: `${phase} stage`
  }));

  await ProjectSummary.findOneAndUpdate(
    { projectId: project.id },
    {
      $set: {
        projectId: project.id,
        projectName: project.name || "",
        projectOwner: project.ownerId || "",
        currentPhase: project.lifecycleStage,
        roadmap
      }
    },
    { upsert: true, new: true }
  );
}

async function addProjectFeed(projectId, userId, title, message) {
  const user = userId ? await User.findOne({ id: userId }).lean() : null;
  await Feed.create({
    id: "F-" + Date.now(),
    projectId,
    userId: userId || "system",
    userName: user?.name || "System",
    module: "Lifecycle",
    content: `${title}: ${message}`,
    progress: 0,
    blockers: "",
    creatorId: userId || "system",
    timestamp: new Date().toISOString()
  });
}

async function addProjectMilestone(projectId, title) {
  await Milestone.create({
    id: "M-" + Date.now(),
    projectId,
    title,
    date: new Date().toISOString().slice(0, 10),
    progress: 100,
    description: `${title} milestone auto-created from lifecycle transition`,
    creatorId: "system"
  });
}

async function addProjectNotification(userId, title, message, projectId = "") {
  await Notification.create({
    id: "N-" + nanoid(8).toUpperCase(),
    projectId,
    userId: userId || "all",
    title,
    message,
    read: false,
    deletedBy: [],
    creatorId: "system",
    timestamp: new Date().toISOString()
  });
}

async function seedDefaultLead() {
  try {
    const existing = await User.findOne({ username: "manikandan" }).lean();
    if (existing) return;
    const passwordHash = await bcrypt.hash("admin123", 10);
    await User.create({
      id: "admin-001",
      name: "Manikandan",
      username: "manikandan",
      passwordHash,
      role: "lead",
      module: "Management"
    });
    console.log("✅ Seeded admin: manikandan / admin123");
  } catch (err) {
    console.error("❌ Seed Error:", err.message);
  }
}

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Nayaruvi Pulse Backend Running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "Nayaruvi Pulse Backend" });
});

app.get("/api/db", async (req, res) => {
  try {
    const [
      projects, projectSummaries, users, tasks, feed,
      milestones, docs, meetings, chats, notifications,
      attendance, deadlines
    ] = await Promise.all([
      Project.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean(),
      ProjectSummary.find({}, { _id: 0, __v: 0 }).lean(),
      User.find({}, { _id: 0, passwordHash: 0, __v: 0 }).lean(),
      Task.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean(),
      Feed.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean(),
      Milestone.find({}, { _id: 0, __v: 0 }).sort({ date: 1, createdAt: -1 }).lean(),
      Doc.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean(),
      Meeting.find({}, { _id: 0, __v: 0 }).sort({ startAt: 1, date: 1, createdAt: -1 }).lean(),
      Chat.find({}, { _id: 0, __v: 0 }).sort({ createdAt: 1 }).lean(),
      Notification.find({}, { _id: 0, __v: 0 }).sort({ createdAt: 1 }).lean(),
      Attendance.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean(),
      Deadline.find({}, { _id: 0, __v: 0 }).sort({ dueDate: 1, createdAt: -1 }).lean()
    ]);

    res.json({
      projects,
      projectSummaries,
      users,
      tasks: tasks.map(normalizeTask),
      feed,
      milestones,
      docs,
      meetings: meetings.map(normalizeMeeting),
      chats,
      notifications,
      attendance,
      deadlines
    });
  } catch (err) {
    res.status(500).json({ error: "DB load failed", details: err.message });
  }
});

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    res.json({ user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// ------------------------------------------------------------
// Projects
// ------------------------------------------------------------
app.get("/api/projects", async (req, res) => {
  try {
    const projects = await Project.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects", details: err.message });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.name) return res.status(400).json({ error: "Project name is required" });

    const project = await Project.create({
      id: payload.id || `project_${Date.now()}`,
      name: payload.name,
      code: payload.code || "",
      description: payload.description || "",
      ownerId: payload.ownerId || "",
      memberIds: Array.isArray(payload.memberIds) ? [...new Set(payload.memberIds)] : [],
      status: payload.status || "active",
      lifecycleStage: payload.lifecycleStage || "Upstream",
      stageUpdatedAt: new Date(),
      stageUpdatedBy: payload.ownerId || "",
      transitionHistory: [{
        from: null,
        to: payload.lifecycleStage || "Upstream",
        by: payload.ownerId || "",
        at: new Date(),
        note: "Project created"
      }],
      workflowData: payload.workflowData || {}
    });

    await syncProjectSummaryFromStage(project);
    res.json({ success: true, project: stripMongo(project.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create project", details: err.message });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    const existing = await Project.findOne({ id });
    if (!existing) return res.status(404).json({ error: "Project not found" });

    existing.name = payload.name ?? existing.name;
    existing.code = payload.code ?? existing.code;
    existing.description = payload.description ?? existing.description;
    existing.ownerId = payload.ownerId ?? existing.ownerId;
    existing.memberIds = Array.isArray(payload.memberIds) ? [...new Set(payload.memberIds)] : existing.memberIds;
    existing.status = payload.status ?? existing.status;

    if (payload.workflowData && typeof payload.workflowData === "object") {
      existing.workflowData = { ...(existing.workflowData || {}), ...payload.workflowData };
    }

    await existing.save();
    await syncProjectSummaryFromStage(existing);

    res.json({ success: true, project: stripMongo(existing.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update project", details: err.message });
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Project.findOneAndDelete({ id });
    if (!existing) return res.status(404).json({ error: "Project not found" });

    await Promise.all([
      ProjectSummary.deleteMany({ projectId: id }),
      Task.deleteMany({ projectId: id }),
      Feed.deleteMany({ projectId: id }),
      Milestone.deleteMany({ projectId: id }),
      Doc.deleteMany({ projectId: id }),
      Meeting.deleteMany({ projectId: id }),
      Chat.deleteMany({ projectId: id }),
      Notification.deleteMany({ projectId: id }),
      Deadline.deleteMany({ projectId: id })
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project", details: err.message });
  }
});

app.post("/api/projects/:id/transition", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role, note = "", nextStage, workflowData = {} } = req.body || {};

    const project = await Project.findOne({ id });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const currentStage = project.lifecycleStage || "Upstream";
    const expectedNextStage = getNextLifecycleStage(currentStage);
    if (!expectedNextStage) {
      return res.status(400).json({ error: "Project is already in the final lifecycle stage" });
    }

    if (nextStage && nextStage !== expectedNextStage) {
      return res.status(400).json({
        error: `Invalid transition from ${currentStage} to ${nextStage}`,
        expectedNextStage
      });
    }

    const rule = WORKFLOW_RULES[currentStage];
    if (!rule) {
      return res.status(400).json({ error: `No workflow rule configured for ${currentStage}` });
    }

    const actorRole = role || "member";
    if (rule.allowedRoles?.length && !rule.allowedRoles.includes(actorRole)) {
      return res.status(403).json({ error: `Role ${actorRole} cannot move project from ${currentStage}` });
    }

    const missingFields = getMissingRequiredFields(project, expectedNextStage, workflowData);
    if (missingFields.length) {
      return res.status(400).json({
        error: "Missing required workflow fields",
        missingFields,
        nextStage: expectedNextStage
      });
    }

    project.workflowData = { ...(project.workflowData || {}), ...(workflowData || {}) };

    if (WORKFLOW_RULES[expectedNextStage]?.approvalRequired) {
      const approved = project.workflowData.qaSignoff === true;
      if (!approved) {
        return res.status(400).json({
          error: `Approval/sign-off is required before moving to ${expectedNextStage}`
        });
      }
    }

    project.transitionHistory.push({
      from: currentStage,
      to: expectedNextStage,
      by: userId || "",
      at: new Date(),
      note
    });

    project.lifecycleStage = expectedNextStage;
    project.stageUpdatedAt = new Date();
    project.stageUpdatedBy = userId || "";
    if (expectedNextStage === "Completed") project.status = "completed";
    if (expectedNextStage === "Closed / Archived") project.status = "archived";

    await project.save();
    await syncProjectSummaryFromStage(project);
    await addProjectFeed(id, userId, "Project Stage Updated", `${currentStage} → ${expectedNextStage}`);
    if (WORKFLOW_RULES[expectedNextStage]?.autoMilestone) {
      await addProjectMilestone(id, WORKFLOW_RULES[expectedNextStage].autoMilestone);
    }
    await addProjectNotification("all", "Project Stage Transition", `${project.name} moved from ${currentStage} to ${expectedNextStage}`, id);

    res.json({
      success: true,
      project: stripMongo(project.toObject()),
      currentStage,
      nextStage: expectedNextStage
    });
  } catch (err) {
    res.status(500).json({ error: "Transition failed", details: err.message });
  }
});

// ------------------------------------------------------------
// Project summary
// ------------------------------------------------------------
app.get("/api/project-summaries/:projectId", async (req, res) => {
  try {
    const summary = await ProjectSummary.findOne({ projectId: req.params.projectId }, { _id: 0, __v: 0 }).lean();
    if (!summary) return res.status(404).json({ error: "Project summary not found" });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch project summary", details: err.message });
  }
});

app.put("/api/project-summaries/:projectId", async (req, res) => {
  try {
    const payload = req.body || {};
    const summary = await ProjectSummary.findOneAndUpdate(
      { projectId: req.params.projectId },
      { $set: payload },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    res.json({ success: true, summary: stripMongo(summary) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update project summary", details: err.message });
  }
});

// ------------------------------------------------------------
// Users
// ------------------------------------------------------------
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}, { _id: 0, passwordHash: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users", details: err.message });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { name, username, password, role = "member", module = "General", id } = req.body || {};
    if (!name || !username || !password) {
      return res.status(400).json({ error: "Name, username, and password are required" });
    }

    const existing = await User.findOne({ username }).lean();
    if (existing) return res.status(400).json({ error: "Username already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      id: id || `U-${nanoid(6).toUpperCase()}`,
      name,
      username,
      passwordHash,
      role,
      module
    });

    res.json({ success: true, user: safeUser(user.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create user", details: err.message });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const payload = req.body || {};
    const user = await User.findOne({ id: req.params.id });
    if (!user) return res.status(404).json({ error: "User not found" });

    user.name = payload.name ?? user.name;
    user.username = payload.username ?? user.username;
    user.role = payload.role ?? user.role;
    user.module = payload.module ?? user.module;
    if (payload.password) {
      user.passwordHash = await bcrypt.hash(payload.password, 10);
    }

    await user.save();
    res.json({ success: true, user: safeUser(user.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user", details: err.message });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findOneAndDelete({ id: req.params.id });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user", details: err.message });
  }
});

// ------------------------------------------------------------
// Tasks
// ------------------------------------------------------------
app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json(tasks.map(normalizeTask));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tasks", details: err.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title) return res.status(400).json({ error: "Task title is required" });

    const task = await Task.create({
      id: payload.id || `T-${nanoid(6).toUpperCase()}`,
      projectId: payload.projectId || "",
      title: payload.title,
      priority: payload.priority || "medium",
      module: payload.module || "General",
      assigneeId: payload.assigneeId || "",
      status: payload.status || "todo",
      creatorId: payload.creatorId || "",
      dueDate: payload.dueDate || payload.deadline || "",
      deadline: payload.deadline || payload.dueDate || "",
      description: payload.description || ""
    });

    if (task.assigneeId) {
      await addProjectNotification(
        task.assigneeId,
        "New Task Assigned",
        `You have been assigned: ${task.title}${task.deadline ? ` • Deadline: ${new Date(task.deadline).toLocaleString()}` : ""}`,
        task.projectId || ""
      );
    }

    res.json({ success: true, task: normalizeTask(task.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create task", details: err.message });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const payload = req.body || {};
    const task = await Task.findOne({ id: req.params.id });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const oldStatus = task.status;
    const oldAssignee = task.assigneeId;

    task.projectId = payload.projectId ?? task.projectId;
    task.title = payload.title ?? task.title;
    task.priority = payload.priority ?? task.priority;
    task.module = payload.module ?? task.module;
    task.assigneeId = payload.assigneeId ?? task.assigneeId;
    task.status = payload.status ?? task.status;
    task.dueDate = payload.dueDate ?? payload.deadline ?? task.dueDate;
    task.deadline = payload.deadline ?? payload.dueDate ?? task.deadline;
    task.description = payload.description ?? task.description;

    await task.save();

    if (payload.status && payload.status !== oldStatus && task.assigneeId) {
      await addProjectNotification(task.assigneeId, "Task Status Updated", `${task.title} moved to ${task.status}`, task.projectId || "");
    }

    if (payload.assigneeId && payload.assigneeId !== oldAssignee) {
      await addProjectNotification(task.assigneeId, "New Task Assigned", `You have been assigned: ${task.title}`, task.projectId || "");
    }

    res.json({ success: true, task: normalizeTask(task.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update task", details: err.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ id: req.params.id });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task", details: err.message });
  }
});

// ------------------------------------------------------------
// Feed
// ------------------------------------------------------------
app.get("/api/feed", async (req, res) => {
  try {
    const items = await Feed.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch feed", details: err.message });
  }
});

app.post("/api/feed", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.content) return res.status(400).json({ error: "Feed content is required" });
    const item = await Feed.create({
      id: payload.id || `F-${nanoid(8).toUpperCase()}`,
      projectId: payload.projectId || "",
      userId: payload.userId || "",
      userName: payload.userName || "Unknown",
      module: payload.module || "General",
      content: payload.content,
      progress: Number(payload.progress || 0),
      blockers: payload.blockers || "",
      creatorId: payload.creatorId || payload.userId || "",
      timestamp: payload.timestamp || new Date().toISOString()
    });
    res.json({ success: true, item: stripMongo(item.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create feed item", details: err.message });
  }
});

app.put("/api/feed/:id", async (req, res) => {
  try {
    const item = await Feed.findOneAndUpdate({ id: req.params.id }, { $set: req.body || {} }, { new: true }).lean();
    if (!item) return res.status(404).json({ error: "Feed item not found" });
    res.json({ success: true, item: stripMongo(item) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update feed item", details: err.message });
  }
});

app.delete("/api/feed/:id", async (req, res) => {
  try {
    const item = await Feed.findOneAndDelete({ id: req.params.id });
    if (!item) return res.status(404).json({ error: "Feed item not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete feed item", details: err.message });
  }
});

// ------------------------------------------------------------
// Milestones
// ------------------------------------------------------------
app.get("/api/milestones", async (req, res) => {
  try {
    const items = await Milestone.find({}, { _id: 0, __v: 0 }).sort({ date: 1, createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch milestones", details: err.message });
  }
});

app.post("/api/milestones", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title) return res.status(400).json({ error: "Milestone title is required" });
    const item = await Milestone.create({
      id: payload.id || `M-${nanoid(8).toUpperCase()}`,
      projectId: payload.projectId || "",
      title: payload.title,
      date: payload.date || "",
      progress: Number(payload.progress || 0),
      description: payload.description || "",
      creatorId: payload.creatorId || ""
    });
    await addProjectNotification("all", "New Milestone Added", `${item.title} has been added${item.date ? ` with target date ${item.date}` : ""}`, item.projectId || "");
    res.json({ success: true, milestone: stripMongo(item.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create milestone", details: err.message });
  }
});

app.put("/api/milestones/:id", async (req, res) => {
  try {
    const item = await Milestone.findOneAndUpdate({ id: req.params.id }, { $set: req.body || {} }, { new: true }).lean();
    if (!item) return res.status(404).json({ error: "Milestone not found" });
    res.json({ success: true, milestone: stripMongo(item) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update milestone", details: err.message });
  }
});

app.delete("/api/milestones/:id", async (req, res) => {
  try {
    const item = await Milestone.findOneAndDelete({ id: req.params.id });
    if (!item) return res.status(404).json({ error: "Milestone not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete milestone", details: err.message });
  }
});

// ------------------------------------------------------------
// Docs / Knowledge base
// ------------------------------------------------------------
app.get("/api/docs", async (req, res) => {
  try {
    const docs = await Doc.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch docs", details: err.message });
  }
});

app.post("/api/docs", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title) return res.status(400).json({ error: "Doc title is required" });

    const doc = await Doc.create({
      id: payload.id || `D-${nanoid(8).toUpperCase()}`,
      projectId: payload.projectId || "",
      title: payload.title,
      url: payload.url || "",
      fileName: payload.fileName || "",
      fileUrl: payload.fileUrl || "",
      fileType: payload.fileType || "",
      fileSize: Number(payload.fileSize || 0),
      uploadedBy: payload.uploadedBy || "",
      creatorId: payload.creatorId || ""
    });

    await addProjectNotification("all", "Knowledge Resource Published", `${doc.title} has been added to the knowledge base`, doc.projectId || "");
    res.json({ success: true, doc: stripMongo(doc.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create doc", details: err.message });
  }
});

app.post("/api/docs/upload", upload.single("file"), async (req, res) => {
  try {
    const { title = "", projectId = "", creatorId = "", uploadedBy = "" } = req.body || {};
    if (!req.file) return res.status(400).json({ error: "File upload is required" });

    const doc = await Doc.create({
      id: `D-${nanoid(8).toUpperCase()}`,
      projectId,
      title: title || req.file.originalname,
      url: "",
      fileName: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`,
      fileType: req.file.mimetype || path.extname(req.file.originalname),
      fileSize: req.file.size || 0,
      uploadedBy,
      creatorId
    });

    await addProjectNotification("all", "Knowledge Resource Published", `${doc.title} has been added to the knowledge base`, projectId);
    res.json({ success: true, doc: stripMongo(doc.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "File upload failed", details: err.message });
  }
});

app.put("/api/docs/:id", async (req, res) => {
  try {
    const doc = await Doc.findOneAndUpdate({ id: req.params.id }, { $set: req.body || {} }, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: "Doc not found" });
    res.json({ success: true, doc: stripMongo(doc) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update doc", details: err.message });
  }
});

app.delete("/api/docs/:id", async (req, res) => {
  try {
    const doc = await Doc.findOneAndDelete({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: "Doc not found" });
    if (doc.fileUrl && doc.fileUrl.startsWith("/uploads/")) {
      const fullPath = path.join(__dirname, doc.fileUrl);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete doc", details: err.message });
  }
});

// ------------------------------------------------------------
// Meetings
// ------------------------------------------------------------
app.get("/api/meetings", async (req, res) => {
  try {
    const meetings = await Meeting.find({}, { _id: 0, __v: 0 }).sort({ startAt: 1, date: 1, createdAt: -1 }).lean();
    res.json(meetings.map(normalizeMeeting));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch meetings", details: err.message });
  }
});

app.post("/api/meetings", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title) return res.status(400).json({ error: "Meeting title is required" });

    const meeting = await Meeting.create({
      id: payload.id || `ME-${nanoid(8).toUpperCase()}`,
      projectId: payload.projectId || "",
      title: payload.title,
      date: payload.date || payload.startAt || "",
      startAt: payload.startAt || payload.date || "",
      endAt: payload.endAt || "",
      notes: payload.notes || "",
      location: payload.location || "",
      link: payload.link || "",
      creatorId: payload.creatorId || ""
    });

    await addProjectNotification("all", "New Meeting Logged", `A new meeting "${meeting.title}" was added${meeting.startAt ? ` for ${new Date(meeting.startAt).toLocaleString()}` : ""}`, meeting.projectId || "");
    res.json({ success: true, meeting: normalizeMeeting(meeting.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create meeting", details: err.message });
  }
});

app.put("/api/meetings/:id", async (req, res) => {
  try {
    const payload = req.body || {};
    const meeting = await Meeting.findOne({ id: req.params.id });
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    meeting.projectId = payload.projectId ?? meeting.projectId;
    meeting.title = payload.title ?? meeting.title;
    meeting.date = payload.date ?? payload.startAt ?? meeting.date;
    meeting.startAt = payload.startAt ?? payload.date ?? meeting.startAt;
    meeting.endAt = payload.endAt ?? meeting.endAt;
    meeting.notes = payload.notes ?? meeting.notes;
    meeting.location = payload.location ?? meeting.location;
    meeting.link = payload.link ?? meeting.link;

    await meeting.save();
    res.json({ success: true, meeting: normalizeMeeting(meeting.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update meeting", details: err.message });
  }
});

app.delete("/api/meetings/:id", async (req, res) => {
  try {
    const meeting = await Meeting.findOneAndDelete({ id: req.params.id });
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete meeting", details: err.message });
  }
});

// ------------------------------------------------------------
// Team chat
// ------------------------------------------------------------
app.get("/api/chats", async (req, res) => {
  try {
    const chats = await Chat.find({}, { _id: 0, __v: 0 }).sort({ createdAt: 1 }).lean();
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chats", details: err.message });
  }
});

app.post("/api/chats", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.message) return res.status(400).json({ error: "Message is required" });

    const chat = await Chat.create({
      id: payload.id || `C-${nanoid(8).toUpperCase()}`,
      projectId: payload.projectId || "",
      userId: payload.userId || "",
      userName: payload.userName || "Unknown",
      message: payload.message,
      seenBy: Array.isArray(payload.seenBy) ? payload.seenBy : (payload.userId ? [payload.userId] : []),
      creatorId: payload.creatorId || payload.userId || "",
      timestamp: payload.timestamp || new Date().toISOString()
    });

    await addProjectNotification(
      "all",
      "New Chat Message",
      `${chat.userName} sent a new message in Team Chat`,
      chat.projectId || ""
    );

    res.json({ success: true, chat: stripMongo(chat.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create chat message", details: err.message });
  }
});

app.patch("/api/chats/:id/seen", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const chat = await Chat.findOne({ id: req.params.id });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    if (!chat.seenBy.includes(userId)) {
      chat.seenBy.push(userId);
      await chat.save();
    }

    res.json({ success: true, chat: stripMongo(chat.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark chat as seen", details: err.message });
  }
});

app.delete("/api/chats/:id", async (req, res) => {
  try {
    const chat = await Chat.findOneAndDelete({ id: req.params.id });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete chat", details: err.message });
  }
});

// ------------------------------------------------------------
// Notifications
// ------------------------------------------------------------
app.get("/api/notifications", async (req, res) => {
  try {
    const notifications = await Notification.find({}, { _id: 0, __v: 0 }).sort({ createdAt: 1 }).lean();
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications", details: err.message });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title || !payload.message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const notification = await Notification.create({
      id: payload.id || `N-${nanoid(8).toUpperCase()}`,
      projectId: payload.projectId || "",
      userId: payload.userId || "all",
      title: payload.title,
      message: payload.message,
      read: Boolean(payload.read),
      deletedBy: Array.isArray(payload.deletedBy) ? payload.deletedBy : [],
      creatorId: payload.creatorId || "",
      timestamp: payload.timestamp || new Date().toISOString()
    });

    res.json({ success: true, notification: stripMongo(notification.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create notification", details: err.message });
  }
});

app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findOne({ id: req.params.id });
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    notification.read = true;
    await notification.save();
    res.json({ success: true, notification: stripMongo(notification.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notification as read", details: err.message });
  }
});

app.patch("/api/notifications/read-all", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    await Notification.updateMany(
      { $or: [{ userId }, { userId: "all" }] },
      { $set: { read: true } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark all notifications as read", details: err.message });
  }
});

app.patch("/api/notifications/:id/delete-for-user", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const notification = await Notification.findOne({ id: req.params.id });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    if (!notification.deletedBy.includes(userId)) {
      notification.deletedBy.push(userId);
      await notification.save();
    }

    res.json({ success: true, notification: stripMongo(notification.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete notification for user", details: err.message });
  }
});

app.patch("/api/notifications/delete-all-for-user", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const notifications = await Notification.find({
      $or: [{ userId }, { userId: "all" }]
    });

    await Promise.all(notifications.map(async (notification) => {
      if (!notification.deletedBy.includes(userId)) {
        notification.deletedBy.push(userId);
        await notification.save();
      }
    }));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete all notifications for user", details: err.message });
  }
});

// ------------------------------------------------------------
// Attendance
// ------------------------------------------------------------
app.get("/api/attendance", async (req, res) => {
  try {
    const records = await Attendance.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch attendance", details: err.message });
  }
});

app.post("/api/attendance", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.userId || !payload.userName || !payload.date) {
      return res.status(400).json({ error: "userId, userName, and date are required" });
    }
    const record = await Attendance.create({
      id: payload.id || `A-${nanoid(8).toUpperCase()}`,
      userId: payload.userId,
      userName: payload.userName,
      date: payload.date,
      checkIn: payload.checkIn || "",
      checkOut: payload.checkOut || "",
      status: payload.status || "Present",
      summary: payload.summary || "",
      creatorId: payload.creatorId || ""
    });
    res.json({ success: true, attendance: stripMongo(record.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create attendance", details: err.message });
  }
});

app.put("/api/attendance/:id", async (req, res) => {
  try {
    const record = await Attendance.findOneAndUpdate({ id: req.params.id }, { $set: req.body || {} }, { new: true }).lean();
    if (!record) return res.status(404).json({ error: "Attendance record not found" });
    res.json({ success: true, attendance: stripMongo(record) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update attendance", details: err.message });
  }
});

app.delete("/api/attendance/:id", async (req, res) => {
  try {
    const record = await Attendance.findOneAndDelete({ id: req.params.id });
    if (!record) return res.status(404).json({ error: "Attendance record not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete attendance", details: err.message });
  }
});

// ------------------------------------------------------------
// Deadlines
// ------------------------------------------------------------
app.get("/api/deadlines", async (req, res) => {
  try {
    const items = await Deadline.find({}, { _id: 0, __v: 0 }).sort({ dueDate: 1, createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch deadlines", details: err.message });
  }
});

app.post("/api/deadlines", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title || !payload.dueDate) {
      return res.status(400).json({ error: "Title and dueDate are required" });
    }

    const item = await Deadline.create({
      id: payload.id || `DL-${nanoid(8).toUpperCase()}`,
      projectId: payload.projectId || "",
      title: payload.title,
      description: payload.description || "",
      dueDate: payload.dueDate,
      priority: payload.priority || "medium",
      status: payload.status || "pending",
      assignedTo: payload.assignedTo || "",
      creatorId: payload.creatorId || ""
    });

    res.json({ success: true, deadline: stripMongo(item.toObject()) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create deadline", details: err.message });
  }
});

app.put("/api/deadlines/:id", async (req, res) => {
  try {
    const item = await Deadline.findOneAndUpdate({ id: req.params.id }, { $set: req.body || {} }, { new: true }).lean();
    if (!item) return res.status(404).json({ error: "Deadline not found" });
    res.json({ success: true, deadline: stripMongo(item) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update deadline", details: err.message });
  }
});

app.delete("/api/deadlines/:id", async (req, res) => {
  try {
    const item = await Deadline.findOneAndDelete({ id: req.params.id });
    if (!item) return res.status(404).json({ error: "Deadline not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete deadline", details: err.message });
  }
});

// ------------------------------------------------------------
// Error handling
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || "Unexpected error" });
  }
  next();
});

// ------------------------------------------------------------
// Start server
// ------------------------------------------------------------
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});