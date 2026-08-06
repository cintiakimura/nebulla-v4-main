# Recovery inventory — pages / surfaces

**Class:** independent | integrated  
**Status:** working | partial | broken | unknown  
**Decision:** keep | merge | move | hide | delete  

| Surface | Purpose (current) | Intended | Entry | Main actions → destination | Status | Class | Decision |
|---------|-------------------|----------|-------|----------------------------|--------|-------|----------|
| Start / My Projects | Goal + mode + project list | Screen 1 Start | `/app` default pane `projects` | Continue → reload + Fast Prototype; type chips → same; Open → select project | partial | integrated | keep (simplify later) |
| Workspace Chat (AIChat) | Conversation + activity | Screen 2 conversation | Right rail | Send → Grok; bootstrap → inference-first | partial | integrated | keep |
| Plan (Master Plan) | 5 tabs architecture | Collapsible in workspace | Center `master-plan` / event | Edit tabs → `/api/master-plan/update` | partial | integrated | keep |
| Mind Map | §4 graph | Same as Plan toggle | Event → redirects to plan | View routes | partial | integrated | merge into Plan surface |
| App Preview | Live/preview HTML | Large preview primacy | Center `preview` | Reload preview | partial | integrated | keep |
| UI Studio Beta | UI Gen v2 mockup | Early mockup | `ui-studio-beta` | Generate → engine API | partial | integrated | keep |
| UI Studio (legacy) | Redirects to Beta | Hidden | Alias | — | working | independent | hide |
| Explorer / Code | File tree + editor | Soft-hide | Left rail + `code` | Open file | working | integrated | keep (soft-hide later) |
| Source Control | Git sidebar | Dashboard tool | Left rail | Commit/push UI | unknown | independent | keep (dashboard) |
| Secrets / Services | Keys / DNS embed | Dashboard | Center `secrets` | Save keys | working | independent | keep |
| Security scan | Scan panel | Dashboard | Center `security` | Run scan | working | independent | keep |
| Settings / Onboarding | Account / ride | Dashboard | Vertical nav project-settings | Preferences | partial | independent | keep |
| Deploy / Live | Stage labels in TopBar | Later | Stage strip | Mostly status | unknown | independent | keep (later) |
| Terminal | Collapsed IDE terminal | Collapsed default | Bottom | Shell | working | independent | keep |

## Never happen (target)

- Start: force Dashboard first; require Chat vs Agent to begin  
- Workspace: wipe memory on mode toggle; require coding before first mockup  
- Dashboard: become mandatory gate to first value  
