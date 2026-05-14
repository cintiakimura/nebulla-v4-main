> **Scope — Nebula Project (not Nebula Product)**  
> This workflow describes **Nebula Project** methodology (rules and lifecycle for customer apps). It is typically mirrored from **`nebula-project/`** or kept in sync with those templates; it is **not** Nebula IDE implementation code. **Nebula Product** is the tool under `src/`, `lib/`, `public/`, etc. See **`nebula-project/README.md`**.

---

**Project Workflow**

**High-Level Project Creation Flow**

1. **User Login**
   - User logs in with GitHub or Email

2. **Create New Project**
   - User creates a new project and gives it a name

3. **Connect Your Services (Onboarding)**
   - Grok API Key (strongly recommended)
   - v0 API Key (required for automatic UI generation)
   - Infrastructure Manager runs silently in the background (Render setup, key storage, etc.)

4. **Initial Setup**
   - Grok 4.1 creates the Master Plan
   - Optional: User provides logo, colors, or brand preferences
   - Automatic first UI generation using v0 (powered by Grok 4.1 + Master Plan + brand info)

5. **Foundation Phase (Phase 0)**
   - Grok reads files in this exact order:
     - `project-workflow.md`
     - `master-plan.json`
     - `environment-setup.md`
     - `ui-studio.md`
     - `project-execution-rules.md`
   - Then open **`nebula-ui-studio.md`** (prompt/code sections) as described in `ui-studio.md`.
   - Sets up database schema
   - Implements authentication and base structure

6. **Core Development**
   - Grok 4.1 builds features following the Master Plan
   - User can refine UI in Nebula UI Studio at any time
   - Quality Agent ("Run and Test") can be triggered manually after major changes

7. **Polish & Production Readiness (Phases 3–4)**
   - Manual "Run and Test" recommended before final delivery

8. **Normal Iteration (Phase 5)**
   - After first complete delivery, development continues through normal chat
   - Use "Run and Test" button after significant changes

**Key Rules**
- Grok 4.1 is the primary agent for planning, coding, and reasoning
- Only the Quality Agent exists as support and is **manual only**
- v0 is used **automatically once per project** for the initial UI
- All subsequent UI changes happen in Nebula UI Studio
- Infrastructure Manager handles Render and key management silently
