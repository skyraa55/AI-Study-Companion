# AI Study Companion

A full-stack prototype of the **AI Study Companion** learning workspace, implementing
the PRD's core loop end-to-end:

```
Create Space → Create Project → Add Materials → Process & Understand Content →
Learn with AI Tutor → Take Adaptive Quiz → Evaluate Understanding →
Update Concept Mastery → Track Growth → View Analytics → Next Learning Action
```

Stack: **Node.js / Express / MongoDB (Mongoose)** backend, **React + Tailwind CSS**
(Vite) frontend, AI powered by **Anthropic's Claude API**.

---

## 1. Project Structure

```
ai-study-companion/
├── backend/            Node.js + Express + MongoDB API
│   ├── server.js
│   └── src/
│       ├── config/      DB connection
│       ├── models/      Mongoose schemas (User, Space, Project, Material, ...)
│       ├── middleware/  auth, admin gate, upload, error handling
│       ├── services/    AI service, context builder, material/quiz/mastery/
│       │                analytics services, in-process background job queue
│       ├── controllers/ route handlers
│       └── routes/      Express routers
└── frontend/           React + Vite + Tailwind CSS SPA
    └── src/
        ├── api/          axios client
        ├── context/      Auth context
        ├── components/   shared UI (Navbar, ProgressBar, Loader, ...)
        └── pages/         Login, Register, Dashboard, SpaceDetail,
                            ProjectDetail (+ project-tabs/*), GlobalAnalytics, Admin
```

## 2. How the PRD maps to the implementation

| PRD Concept | Implementation |
|---|---|
| Spaces / Projects | `Space`, `Project` models + nested REST routes |
| Materials → Knowledge | `Material` model; background job extracts a summary + key concepts via Claude, chunks text for retrieval |
| AI Tutor | `Conversation` / `Message` models; chat endpoint grounds every reply in **project-scoped** retrieved material + persistent context (never leaks across projects) |
| Adaptive Quiz | Quiz generation targets concepts with the lowest mastery (`quizService.selectAdaptiveConcepts`), generated async via Claude |
| Evaluate Understanding | MCQ/True-False graded directly; short answers graded by Claude for semantic correctness |
| Concept Mastery | `Mastery` model, updated with a recency-weighted score after every graded attempt |
| Growth / Analytics | `AnalyticsSnapshot` model, aggregated async per-Project and globally, with AI-generated "next learning action" recommendations |
| Persistent Context | `Project.context` (important concepts, difficulties, notes, attention areas) + rolling `Conversation.summary` compressed every 10 messages |
| Asynchronous by Design | `services/jobQueue.js` — an in-process async job runner backed by the `BackgroundJob` model (upload/quiz/analytics endpoints return immediately; the frontend polls) |
| Observable AI | Every Claude call is logged to `AIRequestLog` (latency, tokens, cost, errors, retrieval used) — visible in the Admin Dashboard |
| Safe Application Interaction | All AI calls flow through one function (`services/aiService.js`); the model only ever receives/returns structured JSON, never direct app/DB access |
| Admin Dashboard | `/admin/*` routes + `Admin.jsx`: overview, user management, AI usage, system health (background job success/failure rates) |

### Prototype scope notes (intentionally simplified for a 3–4 day build)
- **Retrieval** uses lightweight keyword-overlap ranking over chunked material text (`contextService.js`), not a vector database. The function is isolated so it can be swapped for real embeddings later without touching callers.
- **Background jobs** run in-process (`setImmediate`) rather than on a durable queue (e.g. BullMQ/Redis). The `BackgroundJob` schema and handler signature were designed so that swap is straightforward.
- **File support** covers `.pdf` and `.txt` uploads, plus pasted text/notes.

---

## 3. Setup

### Prerequisites
- Node.js 18+
- A running MongoDB instance (local or Atlas)
- An Anthropic API key

### Backend

```bash
cd backend
cp .env.example .env
# edit .env: set MONGO_URI, JWT_SECRET, ANTHROPIC_API_KEY

npm install
npm run dev          # starts on http://localhost:5000

# optional: seed an admin user (reads ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME from .env, or uses defaults)
npm run seed:admin
```

### Frontend

```bash
cd frontend
cp .env.example .env
# edit .env if your API isn't on http://localhost:5000/api

npm install
npm run dev           # starts on http://localhost:5173
```

Open `http://localhost:5173`, register an account, and walk through the core loop:
create a Space → create a Project → add a material → chat with the AI Tutor →
generate & take a quiz → check Mastery → check Analytics.

To access the Admin Dashboard, either run `npm run seed:admin` in `backend/`, or
promote an existing user to `role: "admin"` directly in MongoDB.

---

## 4. Key API Endpoints (all under `/api`, JWT-protected unless noted)

```
POST   /auth/register, /auth/login          (public)
GET    /auth/me

POST   /spaces                              GET /spaces
GET    /spaces/:id/dashboard

POST   /spaces/:spaceId/projects            GET /spaces/:spaceId/projects
GET    /projects/:id                        GET /projects/:id/summary

POST   /projects/:id/materials/text
POST   /projects/:id/materials/upload       (multipart, field "file")
GET    /projects/:id/materials

POST   /projects/:id/tutor/conversations
POST   /tutor/conversations/:id/messages

POST   /projects/:id/quizzes                (starts async generation)
GET    /quizzes/:id/take
POST   /quizzes/:id/attempts                (starts async evaluation)

GET    /projects/:id/mastery
POST   /projects/:id/analytics/refresh      GET /projects/:id/analytics
POST   /analytics/global/refresh            GET /analytics/global

GET    /admin/overview, /admin/users, /admin/ai-usage, /admin/system-health, /admin/jobs
```

---

## 5. Notes

- All AI-calling endpoints (materials, tutor, quiz, analytics) are async: the API
  responds immediately and the frontend polls for completion, per the PRD's
  "Asynchronous by Design" principle.
- Every AI call's latency, token usage, estimated cost, and errors are recorded
  and viewable in the Admin Dashboard's "AI Usage" tab.
