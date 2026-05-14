## Nebula Project Documentation

This folder contains the Nebula Project — the rules, methodology and standards.

It is separate from the Nebula Product (the IDE itself located in `src/`, `lib/`, etc.).

Grok must always follow the rules defined in this folder when building user projects.

---

**Project Execution Rules**

**Core Philosophy**
- Grok 4.1 is the main agent for planning, reasoning, coding, and UI prompt creation.
- Only one support agent exists: **Quality Agent** (merged Tester + Reviewer) — triggered **manually** by the user with the **"Run and Test"** button.
- v0 by Vercel is used **automatically once per project** for the initial high-quality UI generation.
- All user API keys (Grok + v0) are respected and used when provided.
- **Nebula Project** (rules in this folder) is strictly separated from **Nebula Product** (the IDE).

**Infrastructure Manager (Silent)**
Runs automatically on new project creation:
- Creates Render workspace, project, and PostgreSQL database
- Stores Render IDs internally
- Handles and validates user-provided Grok and v0 API keys (encrypted at rest)

**Voice & TTS Behavior**
- TTS starts speaking incrementally as Grok 4.1 outputs text (streaming).
- Microphone is automatically muted while TTS is speaking.
- Microphone re-enables automatically after 5 seconds of inactivity.
- User can interrupt TTS by speaking or clicking the button "stop/raise hand"

**Initial Master Plan Interview**
Grok acts as a chill, experienced 28-year-old senior full-stack developer.

**Rules:**
- Ask one question at a time.
- Wait ~2.5 seconds after the user stops speaking.
- Briefly explain why each question matters.
- Always confirm understanding after each answer.
- Politely push back on vague or incomplete answers.
- Only proceed when the user confirms.

**Mandatory Information to Collect:**
1. Core purpose of the app
2. Target users and roles/permissions
3. Key features and priorities
4. Data model and external integrations
5. Security / compliance requirements
6. Brand & visuals (logo, colors, typography) — optional

Once all mandatory information is gathered, Grok provides a clean summary and asks for final confirmation before generating the Master Plan and triggering automatic v0 UI generation.

**Phase 0 – Foundation**
Read order: `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `nebula-ui-studio.md` → this file.
- Create database schema (saved in `Nebula Architecture Spec.md`)
- Set up authentication and base structure
- Automatic v0 UI generation (first version)

**Phase 1 – Core Features**
- Build features one by one from the Master Plan
- Each feature must be functional before moving to the next

**Phase 2 – User Interface**
- Grok 4.1 creates a highly detailed prompt for v0 using Master Plan + brand information
- The prompt is stored in `nebula-ui-studio.md` for future reference
- v0 is called automatically (using user's v0 API key) to generate the first UI version
- All generated files and components are saved in the project
- Future UI refinements are done in Nebula UI Studio with Grok 4.1

**Phase 3 – Polish & User Experience**
- Loading, error, empty states
- Responsive design and basic accessibility

**Phase 4 – Production Readiness**
- Manual "Run and Test" recommended
- Performance optimization and final cleanup

**Phase 5 – Normal Iteration**
- Normal chat + manual "Run and Test" after significant changes
- Free editing in Nebula UI Studio

**"Run and Test" Button**
- Manually triggered by the user
- Analyzes only recently changed files
- Performs code review + testing recommendations

**Single Source of Truth**
`project-execution-rules.md` is the highest authority. Grok must always follow the rules defined here when building user projects.
