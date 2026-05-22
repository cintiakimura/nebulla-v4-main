**Project Execution Rules**

**Core Philosophy**
- Grok 4 is the primary agent for planning, reasoning, and coding.
- Only one support agent exists: **Quality Agent** (merged Tester + Reviewer) — triggered **manually** by the user with the **"Run and Test"** button.
- v0 by Vercel is used **automatically once per project** for the initial high-quality UI generation.
- The main Grok brain reads **`GROK_API_KEY_LUMEN` from the server environment** (Nebula Product `.env` / host secrets) for **both** normal chat and the coding phase — never a separate user-facing coding key. **User-facing Grok API key input is disabled** in the product (My services, Secrets, Account); operators set Grok-related keys only in server env per **`environment-setup.md`** (defaults for chat, swarm, TTS, and writers).
- **Chat vs build:** In normal conversation, Grok replies in natural prose (no implementation code fences in chat). When the user wants to build or change code, Grok must use **START_CODING** / **Go** and **file blocks** (`\`\`\`file:path\` …) for server apply — not markdown code snippets in chat.
- **Nebula Project** (rules in this folder) is strictly separated from **Nebula Product** (the IDE itself).

**Infrastructure Manager (Silent)**
Runs automatically on onboarding and new project creation:
- Creates Render project + database
- Stores Render workspace/project IDs
- Handles and validates user **v0** API keys; main Grok uses server `GROK_API_KEY_LUMEN` only (no user Grok key collection in UI).

**Voice & TTS Behavior**
- TTS starts speaking as soon as Grok 4 outputs text (streaming).
- Microphone is automatically muted while TTS is speaking.
- Microphone re-enables automatically after 5 seconds of inactivity.

**Initial Master Plan Interview**
Grok acts as a chill, experienced senior full-stack developer.

Rules (must be followed):
- Ask **one question at a time**.
- Wait ~2.5 seconds after the user stops speaking.
- Briefly explain why each question matters.
- Always confirm understanding after each answer.
- Politely push back on vague answers.
- Only proceed when the user confirms.

**Mandatory Information to Collect:**
1. Core purpose of the app
2. Target users and roles/permissions
3. Key features and priorities
4. Data model and external integrations
5. Security / compliance requirements
6. Brand & visuals (logo, colors, typography) — optional

Once all mandatory information is gathered and confirmed, Grok provides a clean summary and asks for final confirmation before generating the Master Plan and triggering automatic v0 UI generation.

**Phase 0 – Foundation**
- Read order: `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `nebula-ui-studio.md` → this file
- Create database schema from Master Plan
- Set up authentication
- Automatic v0 UI generation (first version)

**Phase 1 – Core Features**
- Build features one by one from Master Plan
- Each feature must be functional before moving to the next

**Phase 2 – User Interface**
- First version generated automatically with v0
- Subsequent changes done in Nebula UI Studio using Grok 4

**Phase 3 – Polish & UX**
- Loading, error, empty states
- Responsive design and basic accessibility

**Phase 4 – Production Readiness**
- Full manual "Run and Test"
- Performance optimization and cleanup

**Phase 5 – Normal Iteration**
- Normal chat + manual "Run and Test" after significant changes

**"Run and Test" Button**
- Manually triggered by the user after major changes
- Analyzes only recently changed files
- Performs code review + test suggestions

**Chat history persistence**
- All chat history must be stored via **`conversationLog.ts`** (server) **per `projectKey`** for continuity and reference. Partner (`AssistantSidebar`) and IDE (`AIChat`) load history through **`GET /api/conversation-log`**; successful Grok turns are appended after **`POST /api/grok/chat`**.

**Single Source of Truth**
`project-execution-rules.md` is the highest authority. Grok must always follow the rules defined here.