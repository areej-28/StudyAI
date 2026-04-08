/**
 * routes/ai.js — AI Feature Routes
 *
 * This file handles all AI-powered features:
 *   POST /api/ai/upload-file   → Parse uploaded PDF or TXT
 *   POST /api/ai/summarize     → Generate a summary
 *   POST /api/ai/questions     → Generate MCQ practice questions
 *   POST /api/ai/study-plan    → Generate a day-by-day study plan
 *
 * AI Flow (how it works):
 *   Frontend → POST to /api/ai/<feature>
 *           → Backend builds a prompt
 *           → Sends to Google Gemini API
 *           → Parses response
 *           → Returns JSON to frontend
 *
 * API Endpoint used:
 *   https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:generateContent
 *   (or falls back to @google/generative-ai SDK with gemini-1.5-flash)
 */

const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const protect = require("../middleware/protect");
const User = require("../models/User");

const router = express.Router();

/* ── Gemini AI Setup ─────────────────────────────────────────
   We use the official @google/generative-ai SDK.
   The SDK automatically calls the correct Gemini endpoint.

   If you want to call the Vertex AI endpoint directly, use:
   https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:generateContent
   with an Authorization: Bearer <GOOGLE_ACCESS_TOKEN> header.

   For most users, the Gemini API key from aistudio.google.com works fine.
──────────────────────────────────────────────────────────────── */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Using gemini-1.5-flash — fast and cost-effective for study content
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

/* ── Multer: handle file uploads in memory ───────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "text/plain"];
    const isOk = allowed.includes(file.mimetype)
      || file.originalname.endsWith(".txt")
      || file.originalname.endsWith(".pdf");
    if (isOk) cb(null, true);
    else cb(new Error("Only PDF and TXT files are supported"));
  },
});

/* ── Helper: get content for AI ──────────────────────────────── */
async function getStudyContent(userId, contentOverride) {
  // If the frontend already sent content (from local kit), use it directly
  if (contentOverride && contentOverride.trim()) return contentOverride;

  // Otherwise, fetch from the user's active kit in MongoDB
  const user = await User.findById(userId).select("studyKits activeKitId savedContent");
  if (user.activeKitId) {
    const kit = user.studyKits.find(k => k.id === user.activeKitId);
    if (kit && kit.content) return kit.content;
  }
  return user.savedContent || "";
}

/* ── Helper: safe AI call with friendly error messages ─────────── */
const axios = require("axios");

async function callGemini(prompt) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-8b-instruct",
        messages: [
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data.choices[0].message.content;

  } catch (error) {
    console.error("OPENROUTER ERROR:", error.response?.data || error.message);
    throw error;
  }
}

/* ── Helper: parse AI JSON response ─────────────────────────────
   The AI sometimes wraps JSON in ```json ... ``` — we strip that.
──────────────────────────────────────────────────────────────── */
function parseAIJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

/* ── Helper: friendly error handler ─────────────────────────────── */
function handleAIError(err, res) {
  console.error("AI Error:", err.message);

  if (err.message?.includes("429") || err.message?.includes("quota")) {
    return res.status(429).json({
      error: "AI quota exceeded. Please get a new Gemini API key from aistudio.google.com/apikey and update your .env file.",
    });
  }
  if (err instanceof SyntaxError) {
    return res.status(500).json({
      error: "AI returned an unexpected format. Please try again.",
    });
  }
  // Strip verbose Google error details for cleaner messages
  const msg = err.message?.split("[")[0]?.trim() || "AI request failed";
  return res.status(500).json({ error: msg });
}

/* ════════════════════════════════════════════════════════════════
   POST /api/ai/upload-file
   Accepts a PDF or TXT file, extracts text, returns it.
   The frontend puts the text into the study content textarea.
════════════════════════════════════════════════════════════════ */
router.post("/upload-file", protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let text = "";

    if (req.file.mimetype === "application/pdf" || req.file.originalname.endsWith(".pdf")) {
      // Parse PDF buffer into plain text
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else {
      // TXT file — just decode the buffer
      text = req.file.buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return res.status(400).json({ error: "Could not extract text from file. Is it a scanned image?" });
    }

    res.json({ text, filename: req.file.originalname });

  } catch (err) {
    console.error("File upload error:", err.message);
    res.status(500).json({ error: "File processing error: " + err.message });
  }
});

/* ════════════════════════════════════════════════════════════════
   POST /api/ai/summarize
   Body: { level: "Basic"|"Medium"|"Detailed", content: "..." }
   Returns: { summary: "..." }
════════════════════════════════════════════════════════════════ */
router.post("/summarize", protect, async (req, res) => {
  try {
    const { level = "Medium", content: bodyContent } = req.body;
    const rawContent = await getStudyContent(req.user.id, bodyContent);

    // limit content size to avoid quota issues
    const content = rawContent.slice(0, 4000);

    if (!content.trim()) {
      return res.status(400).json({
        error: "No study content found. Please add content to your study kit first.",
      });
    }

    // Describe how detailed the summary should be
    const levelGuide = {
      Basic: "a very short, simple summary in 3–5 bullet points using plain, beginner-friendly language",
      Medium: "a clear summary highlighting key concepts in 6–10 organized bullet points",
      Detailed: "a thorough summary covering all main topics, subtopics, definitions, and important details",
    };

    const prompt = `You are a helpful study assistant. Summarize the following study content as ${levelGuide[level] || levelGuide["Medium"]}.

Instructions:
- Use clear bullet points (• or -)
- Group related points under short headings if helpful
- Do not add anything outside the summary itself
- Use plain language that's easy to understand

Study content:
"""
${content}
"""`;

    const summary = await callGemini(prompt);
    res.json({ summary });

  } catch (err) {
    handleAIError(err, res);
  }
});

/* ════════════════════════════════════════════════════════════════
   POST /api/ai/questions
   Body: { count: 10–50, content: "..." }
   Returns: { questions: [{ question, options, correct, explanation }] }
════════════════════════════════════════════════════════════════ */
router.post("/questions", protect, async (req, res) => {
  try {
    const { count = 50, content: bodyContent } = req.body;
    const rawContent = await getStudyContent(req.user.id, bodyContent);
    const content = rawContent.slice(0, 4000);

    if (!content.trim()) {
      return res.status(400).json({
        error: "No study content found. Please add content to your study kit first.",
      });
    }

    const prompt = `You are a study assistant creating multiple-choice questions (MCQs).

Based on the study content below, generate exactly ${count} MCQ questions that test understanding of all major topics.

IMPORTANT: Respond ONLY with a valid JSON array. No extra text, no markdown, no code blocks.

Each question must be a JSON object with exactly these fields:
{
  "question": "the question text",
  "options": ["A. option text", "B. option text", "C. option text", "D. option text"],
  "correct": "A",
  "explanation": "Why this answer is correct and why the others are wrong."
}

Study content:
"""
${content}
"""`;

    const text = await callGemini(prompt);
    const questions = parseAIJson(text);

    if (!Array.isArray(questions)) {
      throw new SyntaxError("Expected JSON array");
    }

    res.json({ questions });

  } catch (err) {
    handleAIError(err, res);
  }
});

/* ════════════════════════════════════════════════════════════════
   POST /api/ai/study-plan
   Body: { deadline: "YYYY-MM-DD", courseName: "...", content: "..." }
   Returns: { plan: [...], tips: [...], daysLeft, deadline, courseName }
════════════════════════════════════════════════════════════════ */
router.post("/study-plan", protect, async (req, res) => {
  try {
    const { deadline, courseName = "the course", content: bodyContent } = req.body;
    const rawContent = await getStudyContent(req.user.id, bodyContent);
    const content = rawContent.slice(0, 4000);

    if (!deadline) {
      return res.status(400).json({ error: "Please provide a deadline date." });
    }
    if (!content.trim()) {
      return res.status(400).json({
        error: "No study content found. Please add content to your study kit first.",
      });
    }

    const today = new Date();
    const deadlineDate = new Date(deadline);
    const daysLeft = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      return res.status(400).json({ error: "Deadline must be a future date." });
    }

    const prompt = `You are a smart, organized study planner.

A student is studying "${courseName}" and has exactly ${daysLeft} days until their deadline (${deadline}).

Based on the study content below, create a realistic day-by-day study plan that:
- Covers all topics in a logical order (easy → hard)
- Includes review days if there are enough days
- Has 3–5 concrete, actionable tasks per day
- Stays realistic and not overwhelming

IMPORTANT: Respond ONLY with a valid JSON object. No extra text, no markdown, no code blocks.

Required JSON structure:
{
  "daysLeft": ${daysLeft},
  "deadline": "${deadline}",
  "courseName": "${courseName}",
  "plan": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "focus": "Topic name",
      "tasks": ["Task 1", "Task 2", "Task 3"]
    }
  ],
  "tips": ["Study tip 1", "Study tip 2", "Study tip 3"]
}

Generate exactly ${daysLeft} day entries. Calculate dates starting from today.

Study content:
"""
${content}
"""`;

    const text = await callGemini(prompt);
    const plan = parseAIJson(text);

    res.json(plan);

  } catch (err) {
    handleAIError(err, res);
  }
});

module.exports = router;
