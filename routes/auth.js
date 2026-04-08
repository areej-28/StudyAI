const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const protect = require("../middleware/protect");

const router = express.Router();

// ── Preset users (seeded on first request if not in DB) ─────────────────────
const PRESET_USERS = [
  { name: "Alice Johnson",  email: "alice@studyai.com",   password: "alice123"   },
  { name: "Bob Smith",      email: "bob@studyai.com",     password: "bob123"     },
  { name: "Carol Williams", email: "carol@studyai.com",   password: "carol123"   },
  { name: "David Lee",      email: "david@studyai.com",   password: "david123"   },
  { name: "Emma Davis",     email: "emma@studyai.com",    password: "emma123"    },
];

// Seed preset users once
let seeded = false;
async function seedPresetUsers() {
  if (seeded) return;
  seeded = true;
  for (const u of PRESET_USERS) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      await User.create(u); // password hashing handled by pre-save hook
    }
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// GET /api/auth/preset-users  — return list for quick login UI
router.get("/preset-users", async (_req, res) => {
  try {
    await seedPresetUsers();
    res.json({ users: PRESET_USERS.map((u) => ({ name: u.name, email: u.email, password: u.password })) });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    await seedPresetUsers();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({
      token: generateToken(user),
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ── Study-kit endpoints ──────────────────────────────────────────────────────

// GET /api/auth/kits  — list all study kits for this user
router.get("/kits", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("studyKits activeKitId");
    res.json({ kits: user.studyKits, activeKitId: user.activeKitId });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// POST /api/auth/kits  — create or update a study kit
router.post("/kits", protect, async (req, res) => {
  try {
    const { id, name, content } = req.body;
    if (!name || !content) {
      return res.status(400).json({ error: "Name and content are required" });
    }

    const user = await User.findById(req.user.id);
    const kitId = id || Date.now().toString();
    const existing = user.studyKits.find((k) => k.id === kitId);

    if (existing) {
      existing.name = name;
      existing.content = content;
    } else {
      user.studyKits.push({ id: kitId, name, content });
    }
    user.activeKitId = kitId;
    await user.save();

    res.json({ message: "Study kit saved", kitId, kits: user.studyKits, activeKitId: user.activeKitId });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// DELETE /api/auth/kits/:kitId
router.delete("/kits/:kitId", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.studyKits = user.studyKits.filter((k) => k.id !== req.params.kitId);
    if (user.activeKitId === req.params.kitId) {
      user.activeKitId = user.studyKits[0]?.id || null;
    }
    await user.save();
    res.json({ message: "Kit deleted", kits: user.studyKits, activeKitId: user.activeKitId });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// PUT /api/auth/kits/active  — switch active kit
router.put("/kits/active", protect, async (req, res) => {
  try {
    const { kitId } = req.body;
    await User.findByIdAndUpdate(req.user.id, { activeKitId: kitId });
    res.json({ message: "Active kit updated", activeKitId: kitId });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ── Plan progress persistence ────────────────────────────────────────────────

// POST /api/auth/plan-progress  — save checkbox states for a kit
router.post("/plan-progress", protect, async (req, res) => {
  try {
    const { kitId, tasks } = req.body; // tasks: [{ taskId, done }]
    const user = await User.findById(req.user.id);
    user.planProgress.set(kitId, tasks);
    await user.save();
    res.json({ message: "Progress saved" });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// GET /api/auth/plan-progress/:kitId
router.get("/plan-progress/:kitId", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const progress = user.planProgress.get(req.params.kitId) || [];
    res.json({ tasks: progress });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ── Preferences ──────────────────────────────────────────────────────────────
router.put("/preferences", protect, async (req, res) => {
  try {
    const { theme, fontSize } = req.body;
    const update = {};
    if (theme) update["preferences.theme"] = theme;
    if (fontSize) update["preferences.fontSize"] = fontSize;
    const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select("preferences");
    res.json({ preferences: user.preferences });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

module.exports = router;
