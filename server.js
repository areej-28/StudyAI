/**
 * SERVER.JS — StudyAI Backend
 * Express + MongoDB + Gemini AI
 *
 * How it works:
 * 1. Express serves static files (HTML/CSS/JS) from /public
 * 2. /api/auth routes handle login and study kit management
 * 3. /api/ai routes handle AI features (summarize, questions, study plan)
 * 4. MongoDB stores users, kits, and preferences
 */

require("dotenv").config();
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const path     = require("path");


const authRoutes = require("./routes/auth");
const aiRoutes   = require("./routes/ai");

const app = express();

/* ── Middleware ─────────────────────────────────────── */
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "public")));

/* ── API Routes ─────────────────────────────────────── */
app.use("/api/auth", authRoutes);
app.use("/api/ai",   aiRoutes);

/* ── Health check (required by CI) ─────────────────── */
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", message: "StudyAI is running" });
});

/* ── Serve app.html for authenticated routes ─────────── */
// If someone navigates to /app directly, serve app.html
app.get("/app", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.html"));
});

/* ── Catch-all: serve auth.html ─────────────────────── */
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

/* ── Connect to MongoDB and start ───────────────────── */
const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`🚀 StudyAI running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

module.exports = app;
