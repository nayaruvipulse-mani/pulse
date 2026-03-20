// server.js ✅ FULL UPDATED BACKEND (MongoDB Atlas + Express)
// ------------------------------------------------------------
// ✅ Seeds default lead user: manikandan / admin123 (only once)
// ✅ Login API
// ✅ GET full DB: /api/db (includes projects & projectSummaries)
// ✅ CRUD: Projects, Tasks, Feed, Milestones, Docs, Meetings, Users
// ✅ ProjectSummary per project (roadmap, risks, config)
// ✅ Team Chat APIs (with projectId)
// ✅ Notifications APIs
// ✅ Personal delete notification support using deletedBy
// ✅ Delete all notifications only for current user
// ✅ Attendance APIs
// ✅ Dedicated Deadlines APIs (with projectId)
// ✅ Task deadline support
// ✅ Meeting start/end/location/link support
// ✅ Password hashing using bcrypt
// ✅ Safe user output (no passwordHash leaked)
// ✅ Knowledge Base file upload support

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

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadsDir); },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${nanoid(6)}-${safeName}`);
  },
});

const allowedExtensions = [
  ".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",
  ".png",".jpg",".jpeg",".webp",".gif",".txt",".zip",
];

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedExtensions.includes(ext)) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

// ------------------------------------------------------------
// MongoDB Connection
// ------------------------------------------------------------
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
    await seedDefaultLead();
  } catch (err) {
    console.log("❌ Mongo Error:", err.message);
    process.exit(1);
  }
}

// ------------------------------------------------------------
// Schemas
// ------------------------------------------------------------

// PROJECT
const ProjectSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    code: { type: String, default: "" },
    description: { type: String, default: "" },
    ownerId: { type: String, default: "" },
    memberIds: { type: [String], default: [] },
    status: { type: String, default: "active" },
  },
  { timestamps: true }
);

// PROJECT SUMMARY
const ProjectSummarySchema = new mongoose.Schema(
  {
    projectId: { type: String, unique: true, index: true, required: true },
    projectName: { type: String, default: "" },
    projectOwner: { type: String, default: "" },
    currentPhase: { type: String, default: "Planning" },
    targetRelease: { type: String, default: "" },
    overallStatus: { type: String, default: "on-track" },
    vision: { type: String, default: "" },
    weeklyFocus: { type: String, default: "" },
    launchGoal: { type: String, default: "" },
    risks: { type: mongoose.Schema.Types.Mixed, default: [] },
    roadmap: {
      type: mongoose.Schema.Types.Mixed,
      default: [
        { id: "r1", phase: "Planning", status: "done", start: "", end: "", description: "Requirement gathering and project planning" },
        { id: "r2", phase: "Design", status: "doing", start: "", end: "", description: "UI/UX design and workflow setup" },
        { id: "r3", phase: "Development", status: "todo", start: "", end: "", description: "Frontend and backend development" },
        { id: "r4", phase: "Testing", status: "todo", start: "", end: "", description: "Bug fixing and quality validation" },
        { id: "r5", phase: "Deployment", status: "todo", start: "", end: "", description: "Production release and monitoring" },
      ]
    },
  },
  { timestamps: true }
);

// USER
const UserSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    username: { type: String, unique: true, index: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: "member" },
    module: { type: String, default: "General" },
  },
  { timestamps: true }
);

// TASK
const TaskSchema = new mongoose.Schema(
  {
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
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

// FEED
const FeedSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    projectId: { type: String, default: "", index: true },
    userId: { type: String, default: "" },
    userName: { type: String, default: "Unknown" },
    module: { type: String, default: "General" },
    content: { type: String, required: true },
    progress: { type: Number, default: 0 },
    blockers: { type: String, default: "" },
    creatorId: { type: String, default: "" },
    timestamp: { type: String, default: "" },
  },
  { timestamps: true }
);

// MILESTONE
const MilestoneSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    projectId: { type: String, default: "", index: true },
    title: { type: String, required: true },
    date: { type: String, default: "" },
    progress: { type: Number, default: 0 },
    description: { type: String, default: "" },
    creatorId: { type: String, default: "" },
  },
  { timestamps: true }
);

// DOC
const DocSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    projectId: { type: String, default: "", index: true },
    title: { type: String, required: true },
    url: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileUrl: { type: String, default: "" },
    fileType: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    uploadedBy: { type: String, default: "" },
    creatorId: { type: String, default: "" },
  },
  { timestamps: true }
);

// MEETING
const MeetingSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    projectId: { type: String, default: "", index: true },
    title: { type: String, required: true },
    date: { type: String, default: "" },
    startAt: { type: String, default: "" },
    endAt: { type: String, default: "" },
    notes: { type: String, default: "" },
    location: { type: String, default: "" },
    link: { type: String, default: "" },
    creatorId: { type: String, default: "" },
  },
  { timestamps: true }
);

// CHAT
const ChatSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    projectId: { type: String, default: "", index: true },
    userId: { type: String, default: "" },
    userName: { type: String, default: "Unknown" },
    message: { type: String, required: true },
    seenBy: { type: [String], default: [] },
    creatorId: { type: String, default: "" },
    timestamp: { type: String, default: "" },
  },
  { timestamps: true }
);

// NOTIFICATION
const NotificationSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    projectId: { type: String, default: "", index: true },
    userId: { type: String, default: "all" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    deletedBy: { type: [String], default: [] },
    creatorId: { type: String, default: "" },
    timestamp: { type: String, default: "" },
  },
  { timestamps: true }
);
// ATTENDANCE
const AttendanceSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    date: { type: String, required: true },
    checkIn: { type: String, default: "" },
    checkOut: { type: String, default: "" },
    status: { type: String, default: "Present" },
    summary: { type: String, default: "" },
    creatorId: { type: String, default: "" },
  },
  { timestamps: true }
);

// DEADLINE
const DeadlineSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, index: true },
    projectId: { type: String, default: "", index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    dueDate: { type: String, required: true },
    priority: { type: String, default: "medium" },
    status: { type: String, default: "pending" },
    assignedTo: { type: String, default: "" },
    creatorId: { type: String, default: "" },
  },
  { timestamps: true }
);

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
  if (!task) return task;
  const clean = stripMongo(task);
  return {
    ...clean,
    deadline: clean.deadline || clean.dueDate || "",
    dueDate: clean.dueDate || clean.deadline || "",
  };
}

function normalizeMeeting(meeting) {
  if (!meeting) return meeting;
  const clean = stripMongo(meeting);
  return {
    ...clean,
    startAt: clean.startAt || clean.date || "",
    date: clean.date || clean.startAt || "",
  };
}

// ------------------------------------------------------------
// Seed default admin
// ------------------------------------------------------------
async function seedDefaultLead() {
  try {
    const exists = await User.findOne({ username: "manikandan" }).lean();
    if (exists) return;
    const passwordHash = await bcrypt.hash("admin123", 10);
    await User.create({
      id: "admin-001",
      name: "Manikandan",
      username: "manikandan",
      passwordHash,
      role: "lead",
      module: "Management",
    });
    console.log("✅ Seeded admin: manikandan / admin123");
  } catch (err) {
    console.log("❌ Seed Error:", err.message);
  }
}

// ------------------------------------------------------------
// Basic route
// ------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Nayaruvi Pulse Backend Running 🚀");
});

// ------------------------------------------------------------
// FULL DB LOAD (includes projects + projectSummaries)
// ------------------------------------------------------------
app.get("/api/db", async (req, res) => {
  try {
    const [
      projects,
      projectSummaries,
      users,
      tasks,
      feed,
      milestones,
      docs,
      meetings,
      chats,
      notifications,
      attendance,
      deadlines,
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
      Deadline.find({}, { _id: 0, __v: 0 }).sort({ dueDate: 1, createdAt: -1 }).lean(),
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
      deadlines,
    });
  } catch (err) {
    res.status(500).json({ error: "DB load failed", details: err.message });
  }
});

// ------------------------------------------------------------
// AUTH
// ------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: "username & password required" });
    const user = await User.findOne({ username }).lean();
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    res.json(safeUser(user));
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// ------------------------------------------------------------
// PROJECTS
// ------------------------------------------------------------
app.get("/api/projects", async (req, res) => {
  try {
    const projects = await Project.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: "Projects load failed", details: err.message });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const p = req.body || {};
    if (!p.name) return res.status(400).json({ error: "name required" });
    const created = await Project.create({
      id: p.id || "project_" + nanoid(8),
      name: p.name,
      code: p.code || "",
      description: p.description || "",
      ownerId: p.ownerId || "",
      memberIds: Array.isArray(p.memberIds) ? p.memberIds : [],
      status: p.status || "active",
    });
    res.json(stripMongo(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Project create failed", details: err.message });
  }
});

app.patch("/api/projects/:id", async (req, res) => {
  try {
    const updated = await Project.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body || {} },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Project not found" });
    res.json(stripMongo(updated));
  } catch (err) {
    res.status(500).json({ error: "Project update failed", details: err.message });
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    await Project.deleteOne({ id: req.params.id });
    // Optionally cascade-delete all related data:
    await Promise.all([
      Task.deleteMany({ projectId: req.params.id }),
      Feed.deleteMany({ projectId: req.params.id }),
      Milestone.deleteMany({ projectId: req.params.id }),
      Doc.deleteMany({ projectId: req.params.id }),
      Meeting.deleteMany({ projectId: req.params.id }),
      Chat.deleteMany({ projectId: req.params.id }),
      Deadline.deleteMany({ projectId: req.params.id }),
      ProjectSummary.deleteOne({ projectId: req.params.id }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Project delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// PROJECT SUMMARY
// ------------------------------------------------------------
app.get("/api/project-summary/:projectId", async (req, res) => {
  try {
    let summary = await ProjectSummary.findOne({ projectId: req.params.projectId }, { _id: 0, __v: 0 }).lean();
    if (!summary) {
      // Return default structure
      summary = {
        projectId: req.params.projectId,
        projectName: "",
        projectOwner: "",
        currentPhase: "Planning",
        targetRelease: "",
        overallStatus: "on-track",
        vision: "",
        weeklyFocus: "",
        launchGoal: "",
        risks: [],
        roadmap: [
          { id: "r1", phase: "Planning", status: "done", start: "", end: "", description: "Requirement gathering and project planning" },
          { id: "r2", phase: "Design", status: "doing", start: "", end: "", description: "UI/UX design and workflow setup" },
          { id: "r3", phase: "Development", status: "todo", start: "", end: "", description: "Frontend and backend development" },
          { id: "r4", phase: "Testing", status: "todo", start: "", end: "", description: "Bug fixing and quality validation" },
          { id: "r5", phase: "Deployment", status: "todo", start: "", end: "", description: "Production release and monitoring" },
        ]
      };
    }
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "ProjectSummary load failed", details: err.message });
  }
});

app.patch("/api/project-summary/:projectId", async (req, res) => {
  try {
    const updated = await ProjectSummary.findOneAndUpdate(
      { projectId: req.params.projectId },
      { $set: { ...req.body, projectId: req.params.projectId } },
      { new: true, upsert: true }
    ).lean();
    res.json(stripMongo(updated));
  } catch (err) {
    res.status(500).json({ error: "ProjectSummary update failed", details: err.message });
  }
});

// ------------------------------------------------------------
// USERS
// ------------------------------------------------------------
app.post("/api/users", async (req, res) => {
  try {
    const u = req.body || {};
    if (!u.name || !u.username || !u.password)
      return res.status(400).json({ error: "name, username, password required" });
    const exists = await User.findOne({ username: u.username }).lean();
    if (exists) return res.status(409).json({ error: "username already exists" });
    const passwordHash = await bcrypt.hash(u.password, 10);
    const created = await User.create({
      id: u.id || "U-" + nanoid(6).toUpperCase(),
      name: u.name,
      username: u.username,
      passwordHash,
      role: u.role || "member",
      module: u.module || "General",
    });
    res.json(safeUser(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "User create failed", details: err.message });
  }
});

app.patch("/api/users/:id", async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    delete body.password;
    delete body.passwordHash;
    const updated = await User.findOneAndUpdate(
      { id: req.params.id },
      { $set: body },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "User not found" });
    res.json(safeUser(updated));
  } catch (err) {
    res.status(500).json({ error: "User update failed", details: err.message });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    await User.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "User delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// TASKS
// ------------------------------------------------------------
app.post("/api/tasks", async (req, res) => {
  try {
    const t = req.body || {};
    if (!t.title) return res.status(400).json({ error: "title required" });
    const deadlineValue = t.deadline || t.dueDate || "";
    const created = await Task.create({
      id: "T-" + nanoid(5).toUpperCase(),
      projectId: t.projectId || "",
      title: t.title,
      priority: t.priority || "medium",
      module: t.module || "General",
      assigneeId: t.assigneeId || "",
      status: t.status || "todo",
      creatorId: t.creatorId || "",
      dueDate: deadlineValue,
      deadline: deadlineValue,
      description: t.description || "",
    });
    res.json(normalizeTask(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Task create failed", details: err.message });
  }
});

app.patch("/api/tasks/:id", async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (body.deadline && !body.dueDate) body.dueDate = body.deadline;
    if (body.dueDate && !body.deadline) body.deadline = body.dueDate;
    const updated = await Task.findOneAndUpdate(
      { id: req.params.id },
      { $set: body },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Task not found" });
    res.json(normalizeTask(updated));
  } catch (err) {
    res.status(500).json({ error: "Task update failed", details: err.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await Task.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Task delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// FEED
// ------------------------------------------------------------
app.post("/api/feed", async (req, res) => {
  try {
    const f = req.body || {};
    if (!f.content) return res.status(400).json({ error: "content required" });
    const created = await Feed.create({
      id: "F-" + Date.now(),
      projectId: f.projectId || "",
      userId: f.userId || "",
      userName: f.userName || "Unknown",
      module: f.module || "General",
      content: f.content,
      progress: Number(f.progress || 0),
      blockers: f.blockers || "",
      creatorId: f.creatorId || f.userId || "",
      timestamp: new Date().toISOString(),
    });
    res.json(stripMongo(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Feed create failed", details: err.message });
  }
});

app.delete("/api/feed/:id", async (req, res) => {
  try {
    await Feed.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Feed delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// MILESTONES
// ------------------------------------------------------------
app.post("/api/milestones", async (req, res) => {
  try {
    const m = req.body || {};
    if (!m.title) return res.status(400).json({ error: "title required" });
    const created = await Milestone.create({
      id: "M-" + Date.now(),
      projectId: m.projectId || "",
      title: m.title,
      date: m.date || "",
      progress: Number(m.progress || 0),
      description: m.description || "",
      creatorId: m.creatorId || "",
    });
    res.json(stripMongo(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Milestone create failed", details: err.message });
  }
});

app.patch("/api/milestones/:id", async (req, res) => {
  try {
    const updated = await Milestone.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body || {} },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Milestone not found" });
    res.json(stripMongo(updated));
  } catch (err) {
    res.status(500).json({ error: "Milestone update failed", details: err.message });
  }
});

app.delete("/api/milestones/:id", async (req, res) => {
  try {
    await Milestone.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Milestone delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// DOCS DOWNLOAD
// ------------------------------------------------------------
app.get("/api/docs/download/:id", async (req, res) => {
  try {
    const doc = await Doc.findOne({ id: req.params.id }).lean();
    if (!doc || !doc.fileUrl) return res.status(404).json({ error: "File not found" });
    const relativePath = doc.fileUrl.replace(/^\/uploads\//, "");
    const fullPath = path.join(uploadsDir, relativePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File missing on server" });
    return res.download(fullPath, doc.fileName || path.basename(fullPath));
  } catch (err) {
    res.status(500).json({ error: "Download failed", details: err.message });
  }
});

// ------------------------------------------------------------
// DOCS
// ------------------------------------------------------------
app.post("/api/docs", upload.single("file"), async (req, res) => {
  try {
    const d = req.body || {};
    const file = req.file;
    if (!d.title) return res.status(400).json({ error: "title required" });
    if (!file && !d.url) return res.status(400).json({ error: "Either file or url required" });
    const fileUrl = file ? `/uploads/${file.filename}` : "";
    const fileType = file ? path.extname(file.originalname).toLowerCase() : "";
    const created = await Doc.create({
      id: "D-" + Date.now(),
      projectId: d.projectId || "",
      title: d.title,
      url: (d.url || "").trim(),
      fileName: file ? file.originalname : "",
      fileUrl,
      fileType,
      fileSize: file ? file.size : 0,
      uploadedBy: d.uploadedBy || "",
      creatorId: d.creatorId || "",
    });
    res.json(stripMongo(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Doc create failed", details: err.message });
  }
});

app.delete("/api/docs/:id", async (req, res) => {
  try {
    const doc = await Doc.findOne({ id: req.params.id }).lean();
    if (!doc) return res.status(404).json({ error: "Doc not found" });
    if (doc.fileUrl) {
      const relativePath = doc.fileUrl.replace(/^\/uploads\//, "");
      const fullPath = path.join(uploadsDir, relativePath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await Doc.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Doc delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// MEETINGS
// ------------------------------------------------------------
app.post("/api/meetings", async (req, res) => {
  try {
    const m = req.body || {};
    if (!m.title) return res.status(400).json({ error: "title required" });
    const startAt = m.startAt || m.date || "";
    const date = m.date || m.startAt || "";
    const created = await Meeting.create({
      id: "MT-" + Date.now(),
      projectId: m.projectId || "",
      title: m.title,
      date,
      startAt,
      endAt: m.endAt || "",
      notes: m.notes || "",
      location: m.location || "",
      link: m.link || "",
      creatorId: m.creatorId || "",
    });
    res.json(normalizeMeeting(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Meeting create failed", details: err.message });
  }
});

app.patch("/api/meetings/:id", async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (body.startAt && !body.date) body.date = body.startAt;
    if (body.date && !body.startAt) body.startAt = body.date;
    const updated = await Meeting.findOneAndUpdate(
      { id: req.params.id },
      { $set: body },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Meeting not found" });
    res.json(normalizeMeeting(updated));
  } catch (err) {
    res.status(500).json({ error: "Meeting update failed", details: err.message });
  }
});

app.delete("/api/meetings/:id", async (req, res) => {
  try {
    await Meeting.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Meeting delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// CHATS
// ------------------------------------------------------------
app.post("/api/chats", async (req, res) => {
  try {
    const c = req.body || {};
    if (!c.message) return res.status(400).json({ error: "message required" });
    const created = await Chat.create({
      id: "C-" + nanoid(8).toUpperCase(),
      projectId: c.projectId || "",
      userId: c.userId || "",
      userName: c.userName || "Unknown",
      message: c.message,
      seenBy: Array.isArray(c.seenBy) ? c.seenBy : [],
      creatorId: c.creatorId || c.userId || "",
      timestamp: new Date().toISOString(),
    });
    res.json(stripMongo(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Chat create failed", details: err.message });
  }
});

app.patch("/api/chats/:id", async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (body.seenBy && !Array.isArray(body.seenBy))
      return res.status(400).json({ error: "seenBy must be an array" });
    const updated = await Chat.findOneAndUpdate(
      { id: req.params.id },
      { $set: body },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Chat not found" });
    res.json(stripMongo(updated));
  } catch (err) {
    res.status(500).json({ error: "Chat update failed", details: err.message });
  }
});

app.delete("/api/chats/:id", async (req, res) => {
  try {
    await Chat.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Chat delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// NOTIFICATIONS
// ------------------------------------------------------------
app.post("/api/notifications", async (req, res) => {
  try {
    const n = req.body || {};
    if (!n.title || !n.message) {
      return res.status(400).json({ error: "title & message required" });
    }

    const created = await Notification.create({
      id: "N-" + nanoid(8).toUpperCase(),
      projectId: n.projectId || "",
      userId: n.userId || "all",
      title: n.title,
      message: n.message,
      read: Boolean(n.read ?? false),
      deletedBy: [],
      creatorId: n.creatorId || "",
      timestamp: new Date().toISOString(),
    });

    res.json(stripMongo(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Notification create failed", details: err.message });
  }
});

app.patch("/api/notifications/:id", async (req, res) => {
  try {
    const updated = await Notification.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body || {} },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Notification not found" });
    res.json(stripMongo(updated));
  } catch (err) {
    res.status(500).json({ error: "Notification update failed", details: err.message });
  }
});

app.patch("/api/notifications/:id/delete-for-user", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    const notification = await Notification.findOne({ id: req.params.id });
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    const alreadyDeleted = Array.isArray(notification.deletedBy) ? notification.deletedBy.includes(userId) : false;
    if (!alreadyDeleted) {
      notification.deletedBy = [...(notification.deletedBy || []), userId];
      await notification.save();
    }
    res.json({ ok: true, message: "Notification deleted for this user only" });
  } catch (err) {
    res.status(500).json({ error: "Personal notification delete failed", details: err.message });
  }
});

app.patch("/api/notifications/delete-all-for-user", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    const notifications = await Notification.find({ $or: [{ userId }, { userId: "all" }] });
    for (const notification of notifications) {
      const alreadyDeleted = Array.isArray(notification.deletedBy) ? notification.deletedBy.includes(userId) : false;
      if (!alreadyDeleted) {
        notification.deletedBy = [...(notification.deletedBy || []), userId];
        await notification.save();
      }
    }
    res.json({ ok: true, message: "All notifications deleted for this user only" });
  } catch (err) {
    res.status(500).json({ error: "Delete all personal notifications failed", details: err.message });
  }
});

app.delete("/api/notifications/:id", async (req, res) => {
  try {
    const deleted = await Notification.findOneAndDelete({ id: req.params.id }).lean();
    if (!deleted) return res.status(404).json({ error: "Notification not found" });
    res.json({ ok: true, message: "Notification deleted globally" });
  } catch (err) {
    res.status(500).json({ error: "Notification delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// ATTENDANCE
// ------------------------------------------------------------
app.post("/api/attendance/checkin", async (req, res) => {
  try {
    const a = req.body || {};
    if (!a.userId || !a.userName || !a.date)
      return res.status(400).json({ error: "userId, userName, date required" });
    const exists = await Attendance.findOne({ userId: a.userId, date: a.date }).lean();
    if (exists) return res.status(409).json({ error: "Already checked in for today" });
    const created = await Attendance.create({
      id: "A-" + nanoid(8).toUpperCase(),
      userId: a.userId,
      userName: a.userName,
      date: a.date,
      checkIn: a.checkIn || new Date().toLocaleTimeString(),
      checkOut: "",
      status: "Present",
      summary: "",
      creatorId: a.creatorId || a.userId,
    });
    res.json(stripMongo(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Attendance check-in failed", details: err.message });
  }
});

app.patch("/api/attendance/checkout/:userId/:date", async (req, res) => {
  try {
    const { userId, date } = req.params;
    const body = req.body || {};
    const updated = await Attendance.findOneAndUpdate(
      { userId, date },
      { $set: { checkOut: body.checkOut || new Date().toLocaleTimeString(), status: "Checked Out" } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Attendance record not found" });
    res.json(stripMongo(updated));
  } catch (err) {
    res.status(500).json({ error: "Attendance check-out failed", details: err.message });
  }
});

app.patch("/api/attendance/summary/:userId/:date", async (req, res) => {
  try {
    const { userId, date } = req.params;
    const body = req.body || {};
    const updated = await Attendance.findOneAndUpdate(
      { userId, date },
      { $set: { summary: body.summary || "" } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Attendance record not found" });
    res.json(stripMongo(updated));
  } catch (err) {
    res.status(500).json({ error: "Attendance summary update failed", details: err.message });
  }
});

app.get("/api/attendance", async (req, res) => {
  try {
    const items = await Attendance.find({}, { _id: 0, __v: 0 }).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Attendance load failed", details: err.message });
  }
});

// ------------------------------------------------------------
// DEADLINES
// ------------------------------------------------------------
app.post("/api/deadlines", async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.title || !d.dueDate) return res.status(400).json({ error: "title & dueDate required" });
    const created = await Deadline.create({
      id: "DL-" + nanoid(8).toUpperCase(),
      projectId: d.projectId || "",
      title: d.title,
      description: d.description || "",
      dueDate: d.dueDate,
      priority: d.priority || "medium",
      status: d.status || "pending",
      assignedTo: d.assignedTo || "",
      creatorId: d.creatorId || "",
    });
    res.json(stripMongo(created.toObject()));
  } catch (err) {
    res.status(500).json({ error: "Deadline create failed", details: err.message });
  }
});

app.get("/api/deadlines", async (req, res) => {
  try {
    const items = await Deadline.find({}, { _id: 0, __v: 0 }).sort({ dueDate: 1, createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Deadline load failed", details: err.message });
  }
});

app.patch("/api/deadlines/:id", async (req, res) => {
  try {
    const updated = await Deadline.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body || {} },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "Deadline not found" });
    res.json(stripMongo(updated));
  } catch (err) {
    res.status(500).json({ error: "Deadline update failed", details: err.message });
  }
});

app.delete("/api/deadlines/:id", async (req, res) => {
  try {
    await Deadline.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Deadline delete failed", details: err.message });
  }
});

// ------------------------------------------------------------
// Multer error handler
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  if (err && err.message === "Unsupported file type") return res.status(400).json({ error: err.message });
  next(err);
});

// ------------------------------------------------------------
// Start server
// ------------------------------------------------------------
const PORT = process.env.PORT || 5050;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Nayaruvi Pulse server running on port ${PORT}`);
  });
});