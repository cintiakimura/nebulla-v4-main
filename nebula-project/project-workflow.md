## Nebula Project Documentation

This folder contains the Nebula Project — the rules, methodology and standards.

It is separate from the Nebula Product (the IDE itself located in `src/`, `lib/`, etc.).

Grok must always follow the rules defined in this folder when building user projects.

---

**Project Workflow**

**High-Level Project Creation Flow**

1. **Login**
   - User logs in with GitHub or Email

2. **Create New Project**
   - User enters a project name

3. **Connect Your Services (Onboarding)**
   - Grok API Key (strongly recommended)
   - v0 API Key (required for automatic UI generation)
   - Infrastructure Manager runs silently (Render setup, key storage, database creation)

4. **Master Plan Interview**
   - Grok 4.1 conducts a structured but natural interview
   - Mandatory information is collected (core purpose, users, features, data, security, brand)

5. **Automatic Initial Setup**
   - Grok 4.1 generates the full Master Plan
   - Automatic v0 UI generation (first high-quality version)
   - Database schema is created

6. **Foundation Phase (Phase 0)**
   - Grok reads files in this order:
     - `project-workflow.md`
     - `master-plan.json`
     - `environment-setup.md`
     - `nebula-ui-studio.md`
     - `project-execution-rules.md`
   - Base structure and authentication are implemented

7. **Core Development (Phase 1)**
   - Features are built one by one from the Master Plan

8. **UI Development (Phase 2)**
   - First version generated automatically with v0
   - All future refinements happen in Nebula UI Studio

9. **Polish & Production (Phases 3-4)**
   - Manual "Run and Test" is recommended before final delivery

10. **Normal Iteration (Phase 5)**
    - Normal chat + manual "Run and Test" after major changes

**Key Principles**
- Grok 4.1 is the main agent
- Quality Agent is manual only ("Run and Test" button)
- v0 is used automatically once per project for initial UI
- All user API keys are respected
