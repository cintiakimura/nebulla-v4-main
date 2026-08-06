# Recovery inventory — documents

| Path | Purpose | Active | Runtime-driving | Conflicts | Status | Decision |
|------|---------|--------|-----------------|-----------|--------|----------|
| `nebula-project/recovery-orchestration.md` | Conductor map | yes | prompts should cite | — | keep | keep |
| `nebula-project/inference-first-rules.md` | Default sequence | yes | bootstrap / memory | — | keep | keep |
| `nebula-project/project-execution-rules.md` | MP / security / slices / ui-brief | yes | system prompt | — | keep | keep |
| `nebulla-project/ui-generation-logic-v2.md` | UI Gen v2 rules | yes | engine | vs legacy v0 studio doc | keep | keep |
| `nebulla-project/debugging-method.md` | NDM | yes | debug turns | — | keep | keep |
| `nebulla-project/full-bug-database.md` | Bug patterns | yes | debug hints | — | keep | keep |
| `nebulla-project/code-review-checklist.md` | Code quality | yes | coding appendix | — | keep | keep |
| `nebulla-project/incremental-development.md` | Slice discipline | yes | coding | — | keep | keep |
| `nebulla-project/chat-mode-detection.md` | Detector law | yes | detector | Chat vs Agent UX debt | keep | keep |
| `nebulla-project/chat-vs-agent-mode.md` | Interaction modes | yes | interaction mode | Start should not require toggle | keep | keep (simplify UX later) |
| `nebulla-project/user-communication-rules.md` | Voice/copy | yes | prompts | — | keep | keep |
| `nebulla-project/language-system.md` | Locale | yes | prompts | — | keep | keep |
| `nebula-project/README.md` | Folder map | yes | no | — | keep | keep |
| `nebula-project/nebula-ui-studio.md` | Legacy studio / v0 | residual | some prompts | **conflicts** with UI Gen v2 Beta-primary | quarantine | quarantine |
| `nebula-project/project-workflow.md` | Older workflow | unclear | maybe | may overlap execution-rules | quarantine | quarantine |
| `nebula-project/ui-studio.md` | Stub/legacy | unclear | maybe | overlap | quarantine | quarantine |
| `nebula-project/nebulla-project/*` (nested) | Stale UI gen stubs | no | path risk | size mismatch vs guardian root | quarantine | quarantine → archive |
| `nebulla-project/nebulla-project/*` | Extra nest | no | path risk | duplicate | quarantine | quarantine → archive |
| `nebulla-project/ui-generation-engine-manual.md` | Engine manual | support | engine refs | — | keep | keep (support) |
| `nebulla-project/ui-generation-sequence.md` | Sequence notes | support | maybe | overlap v2 logic | quarantine | quarantine |
| `nebulla-project/ui-generation-context.md` | Context | support | maybe | overlap | quarantine | quarantine |
| `nebulla-project/CHANGELOG` / methodology changelogs | History | no | no | — | archive | archive |
| `nebula-project/environment-setup.md` | Env notes | support | no | — | keep | keep (support) |
| `nebula-project/SKILL.md` | Agent skill | support | Cursor | — | keep | keep |

## Document sequence rule

Runtime/prompts consult: **orchestration → inference-first → project-execution → UI Gen v2 → guardian**.  
No lower doc may silently override a higher one.
