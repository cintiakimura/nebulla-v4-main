# Phase 0 — Nebulla data map & delete/export scope

**Status:** Internal freeze for GDPR product baseline (Phase 1).  
**Jurisdiction posture:** EU-first (GDPR-aligned practices). Not a substitute for legal counsel.  
**Last updated:** 2026-07-28

## Subprocessors (typical production)

| Subprocessor | Role | Data typically involved |
|--------------|------|-------------------------|
| Render (or equivalent host) | App hosting, TLS termination | Request metadata, app runtime |
| PostgreSQL on host | Account & project metadata | Email, profile, project rows, encrypted BYOK ciphertext |
| GitHub | OAuth sign-in (optional) | GitHub id, email, display name, avatar URL |
| xAI | Chat / architecture / coding when user or platform key is used | Prompts, code context you send |
| V0 / v0.dev | Optional UI generation | Prompts / UI briefs when V0 is used |
| Email provider (e.g. Resend) | Password reset / transactional mail | Email address, reset tokens |
| Object storage (e.g. R2) if configured | Generated assets | Project asset files |

Analytics: none required by core product today — add here if introduced.

## Data map

| Category | Where stored | Notes |
|----------|--------------|--------|
| Account profile | `nebula_users` (Postgres) | Email, display name, provider ids, password hash, billing tier |
| BYOK API keys | `nebula_users` encrypted columns | AES-GCM; never export plaintext |
| Cloud projects | `nebula_projects` (+ CASCADE children) | Names, graph JSON, Render/D1 ids |
| Workspace files | Disk under persist root / cloud project paths | User-generated app code |
| Chat memory | `conversation-logs/<userId>/` | Markdown logs; retention ~30 days |
| Browser secrets / settings | `localStorage` | Not under server control after logout |
| Sessions | httpOnly cookie JWT | Cleared on logout / account delete |

## Delete account — erase vs retain

**Erased on `DELETE FROM nebula_users` (CASCADE):**  
user row, projects, password resets, token usage rows, BYOK ciphertext columns, related FK children.

**Also erased by Phase 1 delete enhancement:**  
`conversation-logs/<userId>/` directory on the server persist volume.

**Not fully erased by product delete (document in Privacy):**  
- Host/database **backups** until their retention window expires  
- Operational **server logs** (IPs, timestamps) per host retention  
- **Browser** localStorage / guest data (user should clear site data)  
- Third-party provider logs (xAI, GitHub, V0) under their policies  
- Render workspaces / D1 provisioned for projects (best-effort; may remain until infra cleanup)

## Data export scope (Phase 1)

**Included in JSON export:**  
profile (no password hash), flags that BYOK keys exist (not values), cloud project list (names, ids, timestamps), list of conversation log filenames if present.

**Not included:**  
raw API keys, full workspace file zip (optional later), other users’ data.

## Claims allowed after Phase 1

- Account deletion and data export are available.  
- Privacy policy names subprocessors and AI processing.  

**Not allowed:** “GDPR certified”, “SOC 2 compliant”, “ISO certified”.
