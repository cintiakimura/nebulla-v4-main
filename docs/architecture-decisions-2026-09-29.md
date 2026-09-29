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