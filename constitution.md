# Constitution

Non-negotiable. Distilled from docs/architecture-decisions-2026-09-29.md.
Any edit of this file must recompute constitution.sha256. A hash mismatch is a hard refuse.

1. Planning and Execution are separate phases. Execution does not start until a locked plan exists.
2. Chat and the coding agent are different OS processes during execution. They never call each other.
3. The only channel between chat and executor is the on-disk message queue.
4. The executor reads work only from locked plan.json. It does not invent tasks.
5. The executor never interrupts a task. Queue, chat, halt, and re-plan wait until the current task completes.
6. The executor inspects the queue only between tasks, never during a task.
7. Chat accepts input at any time and only enqueues. Duplicate, accidental, or noisy input is queued, never pushed into a running task.
8. The master plan exists only as files under master_plan/. Memory is a cache of disk, never the source of truth.
9. plan.lock makes plan.json read-only. Structure changes go through versioning plus explicit re-approval.
10. Before every edit of plan.json, write versions/plan_vN.json so no revision is lost.
11. Explicit user approval is required to write plan.lock and to resume after a conflicting re-plan.
12. Drafts are validated against this constitution before they are presented. Conflicts are flagged, never auto-fixed.
13. Additive requests append tasks. Conflicting requests require a full re-plan, not an in-place patch.
14. Every module verifies this file's SHA-256 against constitution.sha256 before acting.
