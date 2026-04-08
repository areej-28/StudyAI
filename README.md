# StudyAI — Setup Guide

## What is StudyAI?
An AI-powered study website that helps you:
- 📋 **Summarize** your notes (Basic / Medium / Detailed)
- ❓ **Generate Practice Questions** (MCQs with answers + explanations)
- 📅 **Build a Study Plan** (day-by-day tasks based on your deadline)

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up your environment
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Edit `.env`:
```
MONGODB_URI=mongodb+srv://youruser:yourpassword@cluster.mongodb.net/studyai
JWT_SECRET=any-long-random-string-here
GEMINI_API_KEY=your-gemini-api-key-here
PORT=3000
```

**Get a free Gemini API key:**  
👉 https://aistudio.google.com/apikey  
(Click "Create API key" → copy it → paste in .env)

### 3. Start the server
```bash
npm start          # production
npm run dev        # development (with auto-restart)
```

### 4. Open the app
Visit: http://localhost:3000

Use one of the demo accounts shown on the login page (e.g. alice@studyai.com / alice123)

---

## How the AI works

```
User clicks "Generate Summary"
        │
        ▼
Frontend sends POST /api/ai/summarize
  Body: { content: "your notes...", level: "Medium" }
  Header: Authorization: Bearer <jwt-token>
        │
        ▼
Backend (routes/ai.js)
  - Validates user (middleware/protect.js checks JWT)
  - Builds a prompt: "Summarize this as 6-10 bullet points..."
  - Sends prompt to Google Gemini API
        │
        ▼
Gemini AI returns text
        │
        ▼
Backend returns { summary: "..." } to frontend
        │
        ▼
Frontend displays it below the button
```

---

## API Endpoint Used

The app uses the `@google/generative-ai` SDK with the `gemini-1.5-flash` model.

If you want to use the Vertex AI endpoint directly:
```
POST https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash-lite:generateContent

Headers:
  Authorization: Bearer <GOOGLE_ACCESS_TOKEN>
  Content-Type: application/json

Body:
{
  "contents": [
    { "role": "user", "parts": [{ "text": "Your prompt here" }] }
  ]
}
```

Note: The Vertex AI endpoint requires a Google Cloud project and OAuth token, not just an API key. For simplicity, the Gemini API key from aistudio.google.com is recommended.

---

## Project Structure

```
studyai/
├── public/
│   ├── auth.html    → Login page
│   ├── auth.css     → Login styles
│   ├── app.html     → Main app (dashboard, AI features)
│   ├── app.css      → App styles
│   └── app.js       → Frontend logic (all JavaScript)
├── routes/
│   ├── auth.js      → Login, study kit management endpoints
│   └── ai.js        → AI feature endpoints (summarize, questions, plan)
├── models/
│   └── User.js      → MongoDB user schema
├── middleware/
│   └── protect.js   → JWT authentication middleware
├── server.js         → Express server setup
├── package.json      → Node.js dependencies
└── .env.example      → Environment variables template
```

---

## Troubleshooting

**"AI quota exceeded"**  
→ Get a new API key at https://aistudio.google.com/apikey

**"Could not connect to server"**  
→ Make sure the server is running: `npm start`

**"MongoDB connection error"**  
→ Check your MONGODB_URI in .env — make sure it's a valid MongoDB Atlas connection string

**Questions come out malformed**  
→ This is rare — just try again. The AI occasionally returns slightly different JSON formatting.
