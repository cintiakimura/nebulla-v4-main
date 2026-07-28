# Nebula Debugging Method (NDM)

**Core Principle:**  
Before fixing any bug, Grok **MUST** follow this structured process. This method exists because users spend the majority of their time debugging, and a disciplined approach prevents wasted effort and new bugs.

---

## Step 1: Verify
- Reproduce the bug or error message exactly.
- Clearly state:
  - What was **expected** to happen
  - What is **actually** happening
- Note the exact error message, stack trace, or UI symptom.

### Verify from App Status (preferred when available)
When the user turn includes **`[APP_STATUS_DEBUG]`** (from Nebulla App Status / preview runtime):
- Treat that block as the reproduction evidence for Step 1 (friendly summary + technical message + optional stack/route).
- **Do not** ask “what error do you see?” or tell them to open Inspect → Console.
- Ask only if **expected** behavior is still unclear.
- Keep chat-facing language beginner-friendly (`user-communication-rules.md`); do not paste raw stacks into the bubble unless the user already opened Technical details and asks for more.

See also: `nebulla-project/app-status-runtime.md`.

## Step 2: Analyze
Check the most common bug categories **first** (in this order):

- Import or path errors (404, "Module not found", wrong case)
- Undefined / null / "cannot read property of undefined"
- Port conflicts (`EADDRINUSE`)
- Missing or misconfigured environment variables
- Hydration or React state issues
- API route mismatches between frontend calls and server routes
- Missing dependencies in `package.json`
- Async operations without proper error handling

## Step 3: Trace
- Start from the error location and follow the call stack or data flow.
- Check relevant files, console output, and network requests.
- Use the `code-review-checklist.md` items as a mental checklist while tracing.

## Step 4: Fix
- Make the **smallest possible change** that resolves the root cause.
- Never perform large refactors while debugging.
- **Always** mentally run through `code-review-checklist.md` before applying any change.

## Step 5: Validate
- Confirm the original bug is fixed.
- Verify no new errors or regressions were introduced.
- Test the affected flow end-to-end when possible.

---

**Grok MUST follow NDM** whenever a bug is reported or discovered. Skipping steps leads to incomplete fixes and repeated issues.

---

## Output contract while debugging
- Prefer a short Verify → Analyze → Trace note in chat (1–3 sentences), then apply the fix only as `file:relative/path` fenced blocks.
- Never dump large refactors or casual language fences (typescript/jsx) in chat.
- After Fix, state what was validated (or what the user should click to confirm) in one short Validate line.
- Mentally re-check `code-review-checklist.md` before applying the Fix.
