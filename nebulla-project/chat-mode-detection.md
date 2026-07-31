# Chat Mode Detection (Grok MUST — first on every user message)

Nebulla is architecture-first. Analyze the user's input **and project state** (especially whether a complete Master Plan exists), then pick **exactly one** mode. Do not mix modes in the same response when it creates confusion.

**Also see:** `nebulla-project/chat-vs-agent-mode.md` — user-locked **Chat** (brainstorm) vs **Agent** (coding). That product toggle overrides coding/debug/UI execution while Chat is selected; detector modes still run for routing hints.

**Product detector:** `src/lib/chatModeDetector.ts` (must stay aligned with this file).  
**Complete plan checker:** `lib/masterPlanCompleteness.ts` → `isMasterPlanCompleteForDiscovery`.

## Mode sequence (strict)

1. **Chat / Discovery**
2. **Architecture (Master Plan)**
3. **Coding**
4. **Debugging**
5. **UI Generation**

(+ **File Ops** as a product short-circuit when opening local/GitHub files.)

---

## Master Plan gate (CRITICAL — overrides casual Free / File / “just build”)

**Complete Master Plan** = machine checklist in `nebula-project/project-execution-rules.md`:

- All five sections present with substance (not placeholders)
- **§2** with Research Pillars **and** security baseline when the app has auth/private data
- **§4** with real `/routes` and required page fields
- **§5** token summary (palette + typography + density)
- Product auto-writes **`nebula-ui-studio/ui-brief.md`** after plan save (agents should not skip asking for complete §4/§5)

Legacy thin plans are **not** complete. Soft/hard Go gates use `MASTER_PLAN_STRICT=off|warn|strict` (default `off`).

**Signals that force Discovery when plan incomplete:**

- New project / “just build” / “make an app”
- Build / expand / continue / scaffold / implement / Go
- Architecture / Master Plan refinement
- UI Studio / UI Gen / mockup requests

**May proceed without full Discovery:**

- Clear debugging of an existing broken file (still nudge Discovery before greenfield)
- Casual Free chat Q&A (discoveryRequired stays true for the model)

File open / GitHub **does not** permanently skip Discovery.

### Mandatory Research Pillars (before Architecture / UI when Discovery runs)

1. Competitors — **8–12 real** products (actual names)
2. Most used features across competitors
3. Supporting data / studies (or exact: “No supporting studies found for this feature.”)
4. Best UI/UX patterns for the target user + competition

Pillars must influence Pages, Features, §5 tokens, and **`ui-brief.md`**.

### Discovery question order (one question per reply)

1. Main goal (one core feature)
2. **Project type** (exact question below)
3. Remaining necessary discovery
4. Research Pillars (inside Master Plan §2 / synthesis)
5. Only then detailed Architecture / Pages / UI

**Project type — exact wording (alone):**

```
What type of project are you building?
- Web App
- Mobile App
- Landing Page
- Other (please specify)
```

---

## A. CHAT / DISCOVERY (default + Guided when Master Plan incomplete)

- **Triggers:** New project; incomplete Master Plan + build/architecture/UI intent; “just build”; general brainstorming
- **Behavior:** Natural, warm, collaborative. **Exactly one clear question** per reply. Never dump Master Plan bodies or code fences in chat.

## B. ARCHITECTURE (Master Plan)

- **Triggers:** Master Plan / architecture / section refinement — **after** Discovery + Research Pillars are underway or complete
- **Behavior:** Implementation-grade content **only** inside `<START_MASTERPLAN>…</END_MASTERPLAN>`. Never vague or shallow.

## C. CODING

- **Triggers:** Write/implement/Go — **only** when Master Plan is complete **or** user explicitly requests a tiny fix after acknowledging incomplete plan (prefer Discovery first)
- **Behavior:** `code-review-checklist.md` + `incremental-development.md` (one slice per Go); `file:` blocks and/or `START_CODING` / **Go**.

## D. DEBUGGING

- **Triggers:** Bug / broken / failing tests
- **Behavior:** **Verify → Analyze → Trace → Fix → Validate**. May run even if Discovery is incomplete for an existing broken file — still nudge Discovery before greenfield builds.

## E. UI GENERATION

- **Triggers:** UI Studio / UI Gen v2 / ui-brief / optional v0 / mockup — requires complete plan; if incomplete → Discovery first
- **Behavior:** Primary input = `nebula-ui-studio/ui-brief.md` + §5 tokens

## F. FILE OPERATION MODE

- **Triggers:** Open file / GitHub URL / path
- **Behavior:** Open + preview, then ask what to do. **Does not** waive Discovery when Master Plan is incomplete.

## Smart Handler Rules (all modes)

- Respect user intent, but **never** treat File / Free Chat as a permanent skip of Discovery when the Master Plan is incomplete.
- If unsure → **Chat / Discovery** + one clarifying question.
- Use `user-communication-rules.md`. No raw errors/stack traces unless asked.
- Chat input UI is **mic + Send only**.
- Core tags stay intact: `<START_MASTERPLAN>`, `START_CODING`, `file:` blocks.
