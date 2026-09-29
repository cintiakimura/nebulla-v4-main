<<<<<<< HEAD
# Architecture decisions — 2026-09-29

This file is the locked source of truth for the two-phase agent scaffold.
Do not reinterpret, simplify, or deviate.

## §1 Goal

A two-phase agent system: **Planning** then **Execution**.
During execution there is a **hard separation** between the chat interface and the coding agent.

## §2 Constitution

- `constitution.md` lives at the project root.
- It lists non-negotiable principles distilled from this document.
- A SHA-256 hash of its contents is stored as `constitution.sha256`.
- Any modification of `constitution.md` must update that hash.
- The system **refuses to proceed** if the hash does not match.

## §3 Master plan on disk

Directory `master_plan/`:

- `plan.json` — structured master plan (tasks, dependencies, status).
- `plan.lock` — written the moment the plan is finalized. Once locked, the plan is **read-only**.
- `versions/` — each revision is saved as `plan_vN.json` **before any edit**, so nothing is lost.

The plan **must be persisted to disk**. Nothing about the plan may live only in memory.

## §4 Planning phase

The planner:

1. Runs the brainstorm and architecture conversation.
2. Drafts the constitution (§2) and the master plan (§3).
3. Presents both to the user for review and approval.
4. Writes `plan.lock` and finalizes **only after explicit user approval**.
5. Validates the draft against `constitution.md` **before presenting**. Conflicts are flagged to the user, never silently resolved.

## §5 Executor (execution phase)

The executor is a **separate process** from chat.

- It reads tasks **exclusively** from the locked `plan.json`.
- It runs each task **to completion**. It never stops mid-task, regardless of what arrives in chat.
- It checks the message queue **only between tasks**, never during one.
- If the queue has messages, it processes them **after** the current task finishes, then adapts.

## §6 Chat (execution phase)

The chat is a **separate process** from the executor.

- It accepts user input at any time, including while the executor is running.
- It **never** sends input directly to the executor. It only enqueues messages.
- Accidental clicks, stray audio, or duplicate inputs must be harmless — they land in the queue and are handled safely.

## §7 Message queue

Chat and executor communicate **only** through the message queue (on-disk inbox).
No other IPC, function call, or shared memory channel is allowed between those two processes.

## §8 Conflict detection and re-planning

On every new user request, a diff module:

1. Compares the request against the locked plan and the constitution.
2. Classifies the change as **additive** (append to plan) or **conflicting** (requires re-plan).
3. **On conflict:** stop the executor (after the in-flight task, never mid-task), create a new versioned plan in `versions/`, rewrite the master plan, require user re-approval, then resume from the updated plan.
4. **On additive:** append the task and continue.
5. A conflicting change triggers a **full re-plan cycle**, not an in-place patch.

## §9 Constraints

- Scaffolding and wiring only — no product UI, features, or app logic in this scaffold.
- Do not hardcode task content. The plan drives everything.
- Every module must reference `constitution.md` and refuse to act on anything that conflicts with it.

## §10 Verification

Required:

1. Executor running a long task; user sends three messages during it; executor finishes the task untouched, then processes the queue afterward.
2. Tampering with `constitution.md` is detected via hash mismatch; the system refuses to proceed.
3. A conflicting change triggers a full re-plan cycle, not an in-place patch.
=======
# Architecture Decisions — 2026-09-29

Locked-in core structure for the agent system. These decisions are the source of truth; future changes must not conflict with them.

## 1. Two-phase architecture

**Phase 1 — Planning**
- Brainstorm, architecture, and the master plan are produced together.
- Once finished, the master plan is persisted to disk and locked. It is the source of truth forever — it must survive session crashes or UI glitches.
- Nothing lives only in memory; everything is on disk.

**Phase 2 — Execution**
- The coding agent reads from the locked master plan and works through it task by task.

## 2. Separate chat agent from coding agent

- During the coding phase, the chat and the coding agent run in parallel (multitasking).
- The chat cannot interrupt the coding agent. The coding agent never stops mid-task — it runs to completion.
- User messages queue up. After finishing the current task, the agent revisits the queue and adapts.
- This prevents accidental clicks or stray audio from breaking the coding system.

## 3. Conflict detection and re-planning

- When the user requests a change, compare it against the existing locked plan.
- Classify each change: conflict (override / merge / flag for user) or purely additive (append).
- If the change conflicts with the architecture, the goal of the app, or existing principles, restart the cycle: stop coding, rewrite/edit the master plan, then code again from the updated plan.
- Version the master plan so previous versions can be rolled back or compared.

## 4. Constitution (non-negotiable principles)

- A short, explicit file of non-negotiable principles, written once, versioned, and referenced by every later step.
- During planning, the agent drafts the principles; the user reviews, edits, and approves.
- The file is locked with a hash or signature so any change is detectable.
- Every future plan, diff, or code change is checked against it — conflicts are flagged before acting, not after.

## Summary

Planning and execution are separated. The master plan is locked on disk. The chat never interrupts coding. Conflicts trigger a full re-plan. A constitution guards the principles.
>>>>>>> bc12622b5b9bc615291db72aa063274517689ba2
