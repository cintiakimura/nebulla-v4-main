> **Scope — Nebula Project (not Nebula Product)**  
> This document lives under **`nebula-project/`**: methodology, rules, and standards (“Law of the Land”) for how user projects are built. It is **not** the Nebula IDE source. The IDE and runtime that *apply* these rules are **Nebula Product** (`src/`, `lib/`, `public/`, etc.). See **`nebula-project/README.md`**.

---

**Project Execution Rules**

**Core Principles**
- Grok 4.1 is the main coding and reasoning agent.
- Only one support agent exists: **Quality Agent** (merged Tester + Reviewer) — triggered **manually** by the user via the **"Run and Test"** button.
- Planner and Researcher agents have been removed. Grok 4.1 handles planning and research in single calls.
- v0 (by Vercel) is used **automatically once per project** for the initial high-quality UI generation.
- All user API keys (Grok, v0) are stored securely per user.
- Nebula Project (rules) is strictly separated from Nebula Product (the IDE itself).

**Layer 0 — Infrastructure Manager (silent)**
Runs automatically on new project creation and onboarding:
- Creates Render project + database
- Stores Render workspace/project IDs
- Handles user-provided **GROK_API_KEY** (encrypted server-side when signed in) and **v0** keys via Secrets / onboarding (browser; see `environment-setup.md`)
- Performs initial setup and validation

**Full Project Creation Flow**

1. User logs in (GitHub or Email)
2. User creates a new project
3. Onboarding: "Connect Your Services" (Grok API key + optional v0 API key)
4. Infrastructure Manager runs silently (Render + key storage)
5. Grok 4.1 creates Master Plan + brand handling
6. Automatic first UI generation with v0 (using user's key + Master Plan + brand info)
7. Phase 0 Foundation begins

**Technology Stack (Fixed)**
- Frontend: React + Tailwind + shadcn/ui + Lucide
- UI Generation: v0 by Vercel (once per project)
- Backend: Next.js API Routes (or Vite + Express depending on final stack)
- Database: PostgreSQL on Render
- Deployment: Render

**Brand & Visual Identity (Optional)**
At the end of initial setup, Grok asks:
"Do you have a logo, primary colors, or typography preferences for this project?"

**Phase 0 – Foundation**
- Read order: `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `ui-studio.md` → this file
- Set up database schema from Master Plan
- Implement authentication
- Create base project structure
- Run first automatic UI generation with v0

**Phase 1 – Core Features**
- Build features one by one from Master Plan
- Each feature must be functional before moving to the next

**Phase 2 – User Interface**
- First version is generated automatically with v0
- Subsequent changes and refinements happen in **Nebula UI Studio** using Grok 4.1

**Phase 3 – Polish & UX**
- Loading, error, empty states
- Responsive design and basic accessibility

**Phase 4 – Production Readiness**
- Full testing and review (manual "Run and Test")
- Performance optimization
- Final cleanup

**Phase 5 – Normal Iteration**
After first complete delivery, development continues through normal chat + manual "Run and Test" when needed.

**Important Rules**
- Grok 4.1 writes all code
- Quality Agent is only triggered manually
- Never use Pencil.dev anymore — use v0 for initial UI
- All user API keys are respected and used when provided
- Keep communication minimal and useful

**"Run and Test" Button**
- User can trigger the Quality Agent anytime after major changes
- It performs code review + test suggestions on changed files only