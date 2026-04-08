/* ═══════════════════════════════════════════════════════════════
   APP.JS — StudyAI Frontend Logic
   Clean, beginner-friendly, well-commented
═══════════════════════════════════════════════════════════════ */

/* ── 1. AUTH GUARD ────────────────────────────────────────────
   If no token in localStorage, redirect to login page.
──────────────────────────────────────────────────────────────── */
const token = localStorage.getItem("token");
if (!token) window.location.href = "auth.html";

/* ── 2. SET USER PROFILE ──────────────────────────────────────
   Fill in the sidebar profile from localStorage.
──────────────────────────────────────────────────────────────── */
const userName  = localStorage.getItem("userName")  || "Student";
const userEmail = localStorage.getItem("userEmail") || "";

const profileNameEl   = document.getElementById("profileName");
const profileAvatarEl = document.getElementById("profileAvatar");
if (profileNameEl)   profileNameEl.textContent   = userName;
if (profileAvatarEl) profileAvatarEl.textContent = userName.charAt(0).toUpperCase();

/* ── 3. NAVIGATION ────────────────────────────────────────────
   Switch between pages (Dashboard, Summarize, Questions, Plan, Settings)
──────────────────────────────────────────────────────────────── */
function showPage(id) {
  // Hide all pages and deactivate all nav buttons
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  // Show the selected page
  const page = document.getElementById(id);
  if (page) page.classList.add("active");

  // Activate the matching nav button
  const btn = document.querySelector(`.nav-item[data-page="${id}"]`);
  if (btn) btn.classList.add("active");

  // Update kit labels when switching to AI feature pages
  if (id === "summarize")  updateKitLabel("summarizeKitLabel");
  if (id === "questions")  updateKitLabel("questionsKitLabel");
  if (id === "studyplan")  updateKitLabel("planKitLabel");

  // Close mobile sidebar
  closeSidebar();
}

/* Update the "active kit" label on AI feature pages */
function updateKitLabel(elId) {
  const kit = getActiveKit();
  const el  = document.getElementById(elId);
  if (!el) return;
  if (kit) {
    el.textContent = `Active kit: "${kit.name}"`;
    el.style.color  = "var(--blue-600)";
  } else {
    el.textContent = "⚠ No kit selected — go to Dashboard first";
    el.style.color  = "var(--red-500)";
  }
}

/* ── 4. MOBILE SIDEBAR ─────────────────────────────────────── */
function toggleSidebar() {
  const sidebar  = document.getElementById("sidebar");
  const overlay  = document.getElementById("sidebarOverlay");
  sidebar.classList.toggle("open");
  overlay.classList.toggle("visible");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("visible");
}

/* ── 5. API HELPER ────────────────────────────────────────────
   Sends authenticated JSON requests to the backend.
   Usage: await api("/api/ai/summarize", { content: "...", level: "Medium" })
──────────────────────────────────────────────────────────────── */
async function api(url, body, method = "POST") {
  const options = {
    method,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": "Bearer " + token,
    },
  };
  // Only add body for non-GET/DELETE requests
  if (body && method !== "GET" && method !== "DELETE") {
    options.body = JSON.stringify(body);
  }
  const res  = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

/* ── 6. LOADING OVERLAY ───────────────────────────────────────
   Show/hide a full-screen spinner during AI requests.
──────────────────────────────────────────────────────────────── */
function showLoading(msg = "Generating…") {
  const overlay = document.getElementById("loadingOverlay");
  const msgEl   = document.getElementById("loadingMsg");
  if (msgEl) msgEl.textContent = msg;
  if (overlay) overlay.style.display = "flex";
}
function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";
}

/* ── 7. OUTPUT HELPERS ────────────────────────────────────────
   Render AI text (with bullet points) into an output box.
──────────────────────────────────────────────────────────────── */
function showOutput(elId, text) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = "block";
  el.innerHTML = formatText(text);
}

function showOutputError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = "block";
  el.innerHTML = `<div class="error-msg">⚠ ${escHtml(msg)}</div>`;
}

/* Convert plain AI text (with bullets) to clean HTML */
function formatText(str) {
  return str
    .split("\n")
    .map(line => {
      line = line.trim();
      if (!line) return "";
      if (line.startsWith("* ") || line.startsWith("• ") || line.startsWith("- "))
        return `<li>${escHtml(line.slice(2))}</li>`;
      if (/^\*\*(.+)\*\*$/.test(line))
        return `<p><strong>${escHtml(line.replace(/\*\*/g, ""))}</strong></p>`;
      return `<p>${escHtml(line)}</p>`;
    })
    .join("")
    .replace(/(<li>[\s\S]*?<\/li>)+/g, match => `<ul>${match}</ul>`);
}

/* Escape HTML to prevent XSS */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ══════════════════════════════════════════════════════════════
   SECTION 8: STUDY KITS
   Each kit = { id, name, content }
   Stored locally in localStorage, also synced to the backend.
══════════════════════════════════════════════════════════════ */

let kits       = JSON.parse(localStorage.getItem("studyKits")   || "[]");
let activeKitId = localStorage.getItem("activeKitId") || null;

/* Save kits to localStorage */
function saveKitsLocal() {
  localStorage.setItem("studyKits",   JSON.stringify(kits));
  localStorage.setItem("activeKitId", activeKitId || "");
}

/* Get the currently active kit object */
function getActiveKit() {
  return kits.find(k => k.id === activeKitId) || null;
}

/* Render the list of kit chips across the top */
function renderKitList() {
  const list = document.getElementById("kitList");
  if (!list) return;

  if (kits.length === 0) {
    list.innerHTML = '<p class="no-kits-msg">No study kits yet. Create one below.</p>';
    setEditorVisible(false);
    return;
  }

  list.innerHTML = kits.map(k => `
    <button class="kit-chip ${k.id === activeKitId ? "active-kit" : ""}"
            onclick="selectKit('${k.id}')">
      <span class="kit-chip-icon">📄</span>
      <span>${escHtml(k.name)}</span>
    </button>
  `).join("");

  if (activeKitId) {
    const kit = getActiveKit();
    if (kit) {
      document.getElementById("kitName").value     = kit.name;
      document.getElementById("studyContent").value = kit.content;
    }
    setEditorVisible(true);
  } else {
    setEditorVisible(false);
  }
}

/* Show or hide the editor card */
function setEditorVisible(show) {
  const editor  = document.getElementById("kitEditor");
  const emptyEl = document.getElementById("noneSelected");
  if (editor)  editor.style.display  = show ? "block" : "none";
  if (emptyEl) emptyEl.style.display = show ? "none"  : "flex";
}

/* Select a kit by ID */
function selectKit(id) {
  activeKitId = id;
  saveKitsLocal();
  renderKitList();
  // Sync to backend silently (non-blocking)
  api("/api/auth/kits/active", { kitId: id }, "PUT").catch(() => {});
}

/* Create a new empty kit */
function newKit() {
  const id  = Date.now().toString();
  const kit = { id, name: "New Kit " + (kits.length + 1), content: "" };
  kits.push(kit);
  activeKitId = id;
  saveKitsLocal();
  renderKitList();
}

/* Save the current kit (locally + backend) */
async function saveKit() {
  const name    = document.getElementById("kitName").value.trim();
  const content = document.getElementById("studyContent").value.trim();
  const msgEl   = document.getElementById("saveMsg");

  if (!name || !content) {
    msgEl.textContent = "Name and content are required.";
    msgEl.style.color = "var(--red-500)";
    return;
  }

  const kit = getActiveKit();
  if (!kit) return;

  kit.name    = name;
  kit.content = content;
  saveKitsLocal();
  renderKitList();

  msgEl.textContent = "Saving…";
  msgEl.style.color  = "var(--slate-500)";

  try {
    await api("/api/auth/kits", { id: kit.id, name, content }, "POST");
    msgEl.textContent = "✓ Saved";
    msgEl.style.color  = "var(--green-700)";
  } catch (err) {
    msgEl.textContent = "⚠ Saved locally only";
    msgEl.style.color  = "var(--amber-600)";
  }

  // Clear message after 3 seconds
  setTimeout(() => { msgEl.textContent = ""; }, 3000);
}

/* Delete the active kit */
async function deleteActiveKit() {
  if (!activeKitId) return;
  if (!confirm("Delete this study kit? This cannot be undone.")) return;

  const deletedId = activeKitId;
  kits        = kits.filter(k => k.id !== deletedId);
  activeKitId = kits.length ? kits[kits.length - 1].id : null;
  saveKitsLocal();
  renderKitList();

  // Delete from backend silently
  api("/api/auth/kits/" + deletedId, null, "DELETE").catch(() => {});
}

/* Load kits from the server (merges with local cache) */
async function loadKitsFromServer() {
  try {
    const res = await fetch("/api/auth/kits", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;
    const data = await res.json();

    if (data.kits && data.kits.length > 0) {
      // Server kits win over local ones
      data.kits.forEach(sk => {
        const local = kits.find(k => k.id === sk.id);
        if (!local) kits.push({ id: sk.id, name: sk.name, content: sk.content });
        else { local.name = sk.name; local.content = sk.content; }
      });
      if (data.activeKitId) activeKitId = data.activeKitId;
      saveKitsLocal();
      renderKitList();
    }
  } catch {
    /* Offline — use local cache, no error shown */
  }
}

/* ── FILE UPLOAD (PDF + TXT) ────────────────────────────────── */
document.getElementById("fileInput")?.addEventListener("change", async function (e) {
  const file     = e.target.files[0];
  const statusEl = document.getElementById("uploadStatus");
  if (!file || !statusEl) return;

  statusEl.textContent = "Uploading…";
  statusEl.style.color  = "var(--blue-500)";

  try {
    const formData = new FormData();
    formData.append("file", file);

    const res  = await fetch("/api/ai/upload-file", {
      method:  "POST",
      headers: { Authorization: "Bearer " + token },
      body:    formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    document.getElementById("studyContent").value = data.text;
    statusEl.textContent = "✓ Loaded: " + data.filename;
    statusEl.style.color  = "var(--green-700)";
  } catch (err) {
    statusEl.textContent = "✗ " + err.message;
    statusEl.style.color  = "var(--red-500)";
  }

  // Reset so the same file can be uploaded again
  e.target.value = "";
});

/* ══════════════════════════════════════════════════════════════
   SECTION 9: SUMMARIZE
   How it works:
   1. User clicks "Generate Summary"
   2. Frontend sends { content, level } to POST /api/ai/summarize
   3. Backend sends content + prompt to Gemini AI
   4. Gemini returns a structured summary
   5. Backend returns it to frontend
   6. We display it below the button
══════════════════════════════════════════════════════════════ */
async function generateSummary() {
  const kit      = getActiveKit();
  const outputEl = document.getElementById("summaryOutput");

  // Guard: must have an active kit with content
  if (!kit || !kit.content.trim()) {
    showOutputError("summaryOutput", "Go to Dashboard, select a study kit, and add some content first.");
    document.getElementById("summaryOutput").style.display = "block";
    return;
  }

  const level = document.getElementById("summaryLevel").value;

  showLoading("Generating your summary…");
  if (outputEl) outputEl.style.display = "none";

  try {
    const data = await api("/api/ai/summarize", { level, content: kit.content });
    showOutput("summaryOutput", data.summary);
  } catch (err) {
    showOutputError("summaryOutput", err.message);
  } finally {
    hideLoading();
  }
}

/* ══════════════════════════════════════════════════════════════
   SECTION 10: PRACTICE QUESTIONS
   How it works:
   1. User picks a question count and clicks "Generate Questions"
   2. Frontend sends { content, count } to POST /api/ai/questions
   3. Backend asks Gemini to return a JSON array of MCQ objects
   4. We display one question at a time with A/B/C/D buttons
   5. User clicks an answer → highlighted correct/wrong + explanation
══════════════════════════════════════════════════════════════ */
let questions = [];
let qIndex    = 0;

async function generateQuestions() {
  const kit      = getActiveKit();
  const outputEl = document.getElementById("questionsOutput");

  if (!kit || !kit.content.trim()) {
    outputEl.innerHTML = `<div class="error-msg">⚠ Go to Dashboard and select a study kit with content first.</div>`;
    return;
  }

  const count = parseInt(document.getElementById("questionCount").value);

  document.getElementById("qNav").style.display = "none";
  showLoading(`Generating ${count} practice questions…`);
  outputEl.innerHTML = "";

  try {
    const data = await api("/api/ai/questions", { count, content: kit.content });
    questions  = data.questions;
    qIndex     = 0;
    renderQuestion();
    document.getElementById("qNav").style.display = "flex";
  } catch (err) {
    outputEl.innerHTML = `<div class="error-msg">⚠ ${escHtml(err.message)}</div>`;
  } finally {
    hideLoading();
  }
}

/* Render the current question card */
function renderQuestion() {
  const q        = questions[qIndex];
  const outputEl = document.getElementById("questionsOutput");

  outputEl.innerHTML = `
    <div class="q-card">
      <div class="q-meta">
        <span class="q-num">Question ${qIndex + 1} of ${questions.length}</span>
      </div>
      <p class="q-text">${escHtml(q.question)}</p>
      <div class="q-options">
        ${q.options.map((opt, i) => `
          <button class="answer-btn" onclick="checkAnswer(${i}, '${escHtml(q.correct)}', this)">
            ${escHtml(opt)}
          </button>
        `).join("")}
      </div>
      <div id="feedback" class="feedback"></div>
    </div>
  `;

  document.getElementById("qCounter").textContent = `${qIndex + 1} / ${questions.length}`;
}

/* Check user's answer and show feedback */
function checkAnswer(chosenIndex, correctLetter, clickedBtn) {
  // "A" → 0, "B" → 1, etc.
  const correctIndex = correctLetter.charCodeAt(0) - 65;
  const allBtns      = document.querySelectorAll(".answer-btn");

  // Disable all buttons and highlight correct/wrong
  allBtns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === correctIndex) btn.classList.add("correct");
    else if (i === chosenIndex && chosenIndex !== correctIndex) btn.classList.add("wrong");
  });

  // Show feedback with explanation
  const feedbackEl  = document.getElementById("feedback");
  const isCorrect   = chosenIndex === correctIndex;
  feedbackEl.className = `feedback ${isCorrect ? "correct-fb" : "wrong-fb"}`;
  feedbackEl.innerHTML = `
    <strong>${isCorrect ? "✓ Correct!" : "✗ Incorrect"}</strong>
    ${escHtml(questions[qIndex].explanation)}
  `;
}

/* Navigate questions */
function nextQ() { if (qIndex < questions.length - 1) { qIndex++; renderQuestion(); } }
function prevQ() { if (qIndex > 0) { qIndex--; renderQuestion(); } }

/* ══════════════════════════════════════════════════════════════
   SECTION 11: STUDY PLAN
   How it works:
   1. User enters course name + deadline date
   2. Frontend sends { content, deadline, courseName } to POST /api/ai/study-plan
   3. Backend calculates days left, builds a prompt for Gemini
   4. Gemini returns a JSON object with day-by-day tasks
   5. We render the plan with checkboxes (progress saved to localStorage)
══════════════════════════════════════════════════════════════ */
async function generatePlan() {
  const kit      = getActiveKit();
  const outputEl = document.getElementById("planOutput");

  if (!kit || !kit.content.trim()) {
    outputEl.innerHTML = `<div class="error-msg">⚠ Go to Dashboard and select a study kit with content first.</div>`;
    return;
  }

  const deadline   = document.getElementById("deadline").value;
  const courseName = document.getElementById("courseName").value.trim();

  if (!deadline) {
    outputEl.innerHTML = `<div class="error-msg">⚠ Please set a deadline date.</div>`;
    return;
  }

  document.getElementById("planStats").style.display = "none";
  document.getElementById("planTips").style.display  = "none";
  outputEl.innerHTML = "";

  showLoading("Building your personalized study plan…");

  try {
    const data = await api("/api/ai/study-plan", {
      deadline,
      courseName: courseName || "My Course",
      content: kit.content,
    });
    renderPlan(data, kit.id);
  } catch (err) {
    outputEl.innerHTML = `<div class="error-msg">⚠ ${escHtml(err.message)}</div>`;
  } finally {
    hideLoading();
  }
}

/* Render the study plan with checkboxes */
function renderPlan(data, kitId) {
  const outputEl      = document.getElementById("planOutput");
  const savedProgress = JSON.parse(localStorage.getItem("planProgress_" + kitId) || "{}");

  outputEl.innerHTML = data.plan.map((day, di) => `
    <div class="plan-day">
      <div class="plan-day-header">
        <span class="plan-day-num">Day ${day.day}</span>
        <span class="plan-day-date">${day.date}</span>
        <span class="plan-day-focus">📌 ${escHtml(day.focus)}</span>
      </div>
      <ul class="plan-tasks">
        ${day.tasks.map((task, ti) => {
          const taskId  = `d${di}-t${ti}`;
          const checked = savedProgress[taskId] ? "checked" : "";
          return `
            <li class="plan-task ${checked ? "done-task" : ""}">
              <label>
                <input type="checkbox" data-id="${taskId}" ${checked}
                       onchange="taskToggle(this, '${kitId}')">
                <span>${escHtml(task)}</span>
              </label>
            </li>`;
        }).join("")}
      </ul>
    </div>
  `).join("");

  // Render tips
  if (data.tips && data.tips.length) {
    document.getElementById("tipsList").innerHTML =
      data.tips.map(t => `<li>${escHtml(t)}</li>`).join("");
    document.getElementById("planTips").style.display = "block";
  }

  updatePlanProgress(kitId);
}

/* Toggle a task checkbox and update progress */
function taskToggle(checkbox, kitId) {
  const li = checkbox.closest("li");
  li.classList.toggle("done-task", checkbox.checked);
  saveProgress(kitId);
  updatePlanProgress(kitId);
}

/* Save checkbox states to localStorage */
function saveProgress(kitId) {
  const boxes    = document.querySelectorAll(".plan-tasks input[type=checkbox]");
  const progress = {};
  boxes.forEach(b => { progress[b.dataset.id] = b.checked; });
  localStorage.setItem("planProgress_" + kitId, JSON.stringify(progress));
}

/* Update the progress bar */
function updatePlanProgress(kitId) {
  const boxes = document.querySelectorAll(".plan-tasks input[type=checkbox]");
  if (!boxes.length) return;

  const total = boxes.length;
  const done  = [...boxes].filter(b => b.checked).length;
  const pct   = Math.round((done / total) * 100);

  document.getElementById("planStats").style.display = "block";
  document.getElementById("planProgress").textContent = `${done} / ${total} tasks done`;
  document.getElementById("planPct").textContent      = `${pct}%`;
  document.getElementById("progressBar").style.width  = pct + "%";
}

/* ══════════════════════════════════════════════════════════════
   SECTION 12: SETTINGS
══════════════════════════════════════════════════════════════ */

/* Toggle dark mode */
function toggleTheme(el) {
  document.body.classList.toggle("dark-mode", el.checked);
  localStorage.setItem("theme", el.checked ? "dark" : "light");
  // Save to server silently
  api("/api/auth/preferences", { theme: el.checked ? "dark" : "light" }, "PUT").catch(() => {});
}

/* Change font size */
function setFontSize(size) {
  document.body.classList.remove("fs-small", "fs-medium", "fs-large");
  document.body.classList.add("fs-" + size);

  ["small", "medium", "large"].forEach(s => {
    document.getElementById("fs-" + s)?.classList.remove("fs-active");
  });
  document.getElementById("fs-" + size)?.classList.add("fs-active");

  localStorage.setItem("fontSize", size);
  api("/api/auth/preferences", { fontSize: size }, "PUT").catch(() => {});
}

/* Clear all local study kits */
function clearAllKits() {
  if (!confirm("This will clear all locally cached kits from this browser. Continue?")) return;
  localStorage.removeItem("studyKits");
  localStorage.removeItem("activeKitId");
  kits        = [];
  activeKitId = null;
  renderKitList();
}

/* Logout */
function logout() {
  localStorage.clear();
  window.location.href = "auth.html";
}

/* ══════════════════════════════════════════════════════════════
   SECTION 13: INIT
   Runs when the page first loads.
══════════════════════════════════════════════════════════════ */
(function init() {
  // Restore theme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    const toggle = document.getElementById("themeToggle");
    if (toggle) toggle.checked = true;
  }

  // Restore font size
  const savedFont = localStorage.getItem("fontSize") || "medium";
  document.body.classList.add("fs-" + savedFont);
  document.getElementById("fs-" + savedFont)?.classList.add("fs-active");

  // Render local kits immediately
  renderKitList();

  // Then try to sync from server
  loadKitsFromServer();
})();
