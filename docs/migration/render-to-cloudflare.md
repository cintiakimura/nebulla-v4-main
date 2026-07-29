# Render → Cloudflare migration (Nebulla)

**North star:** Neon unblocks auth → Container hosts the same Express app → Cloudflare owns DNS → shut down Render.

**Principle:** Lift-and-shift first, optimize later. Keep Express + Postgres semantics. Do **not** rewrite to Workers in early phases.

---

## Current architecture (as of Phase 0)

| Piece | Today | Cloudflare role today |
|-------|--------|------------------------|
| Web / API | Render Web Service (`server.ts` Express + Vite) | — |
| Platform DB | Render PostgreSQL (`DATABASE_URL`) — users, sessions, projects, BYOK ciphertext | — |
| Project disk | `data/cloud-projects/{projectKey}/` on host filesystem | — |
| Per-project isolation IDs | Render Projects API (`RENDER_API_KEY` + `RENDER_OWNER_ID`) | — |
| Object storage | — | **R2** (uploads / assets) |
| User-app DB | — | **D1** (auto-provision per Nebulla project) |
| DNS helpers | — | **Cloudflare DNS API** (Secrets → DNS panel) |

Soft-deprecate: treat Render Postgres + Render Web as temporary. Keep `RENDER_*` code until Phase 5; do not delete yet.

---

## Phased plan

| Phase | Goal | Exit gate |
|-------|------|-----------|
| **0** Freeze & inventory | This doc + env name checklist | Inventory written; data-migrate go/no-go |
| **1** Portable Postgres | **Neon** (or any external Postgres) as `DATABASE_URL` | `/api/config` → `cloudStorageReady: true`; login works |
| **2** Domain on Cloudflare | Zone for `nebulla.dev`; records planned | Zone active; cutover DNS known |
| **3** Node off Render | CF Containers (preferred) or Fly/Railway; same app image | App stable on new host URL |
| **4** Domain cutover | DNS → new host; OAuth + `PUBLIC_SITE_URL` | Login + IDE on `nebulla.dev` |
| **5** Decommission Render | Backups verified; delete web + Postgres | No Render bill for Nebulla runtime |
| **6** Hardening (later) | Workspaces → R2; replace Render workspace API; optional Hyperdrive / Workers for static | Separate projects — **not** this PR |

**Efficiency rules**

1. One phase per PR / Agent session.
2. Neon (Phase 1) before Containers (Phase 3).
3. Always use **full** DB hostnames (dots required) — never truncated `dpg-…-a`.
4. If restoring users/BYOK: keep `SESSION_SECRET` + `NEBULA_SECRETS_ENCRYPTION_KEY` unchanged.
5. Rollback = point `DATABASE_URL` / DNS back; do not delete Render until Phase 5.
6. No Workers rewrite until Phase 6.

---

## Phase 0 — Decisions

### Render services to list (fill in manually)

- [ ] Web: `nebulla-v4-main` (or name) — URL: `________________`
- [ ] Postgres: `nebulla_db` — region: **Frankfurt** (confirmed from External URL host)
- [ ] Other Render services: `________________`

### Data migrate go / no-go

| Choice | When | Keys |
|--------|------|------|
| **Empty Neon (faster)** | No production users to keep, or OK to wipe | New DB; create new `SESSION_SECRET` / encryption key OK |
| **Dump → Neon** | Keep users, projects, BYOK | **Must** keep `NEBULA_SECRETS_ENCRYPTION_KEY` (and prefer same `SESSION_SECRET`) |

**Decision for this migration:** `________________` (empty / dump)

---

## Phase 1 — Neon Postgres (manual steps)

1. Create a project at [console.neon.tech](https://console.neon.tech) — prefer **EU / Frankfurt** (or closest EU).
2. Copy the connection string (include `?sslmode=require`). Host must look like `ep-….REGION.aws.neon.tech` (has dots).
3. Local `.env` (never commit):

   ```bash
   DATABASE_URL=postgresql://USER:PASSWORD@ep-….aws.neon.tech/neondb?sslmode=require
   # Optional if still using truncated Render URLs somewhere:
   DATABASE_RENDER_REGION=frankfurt
   SESSION_SECRET=…   # ≥16 chars; keep if restoring sessions/users
   NEBULA_SECRETS_ENCRYPTION_KEY=…  # keep if restoring BYOK
   ```

4. Validate without printing secrets:

   ```bash
   npm run check:database-url
   ```

5. Restart app: `npm run dev`
6. Verify auth checklist (below).
7. **Do not** delete Render Postgres until Phase 5.

### Verify auth checklist

```bash
curl -sS http://localhost:3000/api/config | jq '{cloudStorageReady, databaseConnectionFailed, databaseUrlLooksTruncated, databaseHostHint, githubOAuthReady}'
```

Expect: `cloudStorageReady: true`, `databaseConnectionFailed: false`.

Then in the browser:

- [ ] `/login` — no red Postgres banner
- [ ] Email **Create account** + sign in (cookie `nebula_session`)
- [ ] GitHub OAuth (local uses browser origin for `redirect_uri`; production uses `PUBLIC_SITE_URL`)
- [ ] Optional: Google when `GOOGLE_CLIENT_*` set

**GitHub production note:** Callback must match `PUBLIC_SITE_URL`:

- `https://nebulla.dev/api/auth/github/callback`  
- or staging host: `https://YOUR-HOST/api/auth/github/callback`

---

## Phase 2 — Domain (plan only until Phase 4)

**Targets**

- `PUBLIC_SITE_URL=https://nebulla.dev`
- GitHub: `https://nebulla.dev/api/auth/github/callback`
- Google: `https://nebulla.dev/api/auth/google/callback`

Until cutover, DNS may still point at Render. Document CNAME/A records for the future container hostname in Cloudflare DNS.

---

## What stays vs what changes later

### Stays through Phase 5 (no rewrite)

- Express `server.ts` + `renderStack.ts` auth/session/projects
- `DATABASE_URL` Postgres schema (`nebula_users`, etc.)
- Client BYOK / Master Plan / Mind Map / UI Studio
- Cloudflare R2, D1 provisioning, DNS panel APIs

### Changes in later phases

| Concern | Code / path | Phase |
|---------|-------------|-------|
| Host for Node | Render Web → CF Containers / Fly | 3 |
| Platform DB host | Render PG → Neon (URL only) | 1 |
| `PUBLIC_SITE_URL` / OAuth | Render URL → `nebulla.dev` | 4 |
| `data/cloud-projects/` disk | R2 or volume | 6 / 3 |
| `RENDER_API_KEY` workspace IDs | Local/CF IDs | 5–6 |
| Truncated `dpg-` URLs | Reject / rewrite; prefer Neon | 1 |

### Grep map (for implementers)

- `DATABASE_URL`, `ensureDbReady`, `getRenderPublicConfig` → `renderStack.ts`
- `PUBLIC_SITE_URL`, OAuth redirect → `renderStack.ts`, `src/lib/authRedirect.ts`
- `RENDER_API_KEY`, `RENDER_OWNER_ID` → `renderStack.ts` (`createRenderProjectForNebula`)
- Disk workspaces → `lib/nebulaCloudProjectRoot.ts` (`data/cloud-projects/`)
- R2 / D1 / DNS → `lib/nebulaR2Storage.ts`, `lib/nebulaD1Provisioning.ts`, `lib/nebulaCloudflareDns*.ts`

---

## Env var checklist (names only — values in a password manager)

### Required for cloud auth

| Name | Purpose |
|------|---------|
| `DATABASE_URL` | Platform Postgres (Neon preferred) |
| `SESSION_SECRET` | JWT cookie signing (≥16) |
| `NEBULA_SECRETS_ENCRYPTION_KEY` | BYOK at-rest (prod) |

### Auth providers

| Name | Purpose |
|------|---------|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `PUBLIC_SITE_URL` | Production OAuth + email link base |
| `VITE_PUBLIC_SITE_URL` | Optional client hint |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Password reset email |

### Still Render-tied (until Phase 5)

| Name | Purpose |
|------|---------|
| `RENDER_API_KEY` | Per-project Render Project create |
| `RENDER_OWNER_ID` / `RENDER_WORKSPACE_ID` | Owner for that API |
| `DATABASE_RENDER_REGION` | Only if rewriting truncated Render hosts |

### Cloudflare (keep)

| Name | Purpose |
|------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | Account |
| `CLOUDFLARE_API_TOKEN` | D1 + DNS |
| `CLOUDFLARE_*` / `R2_*` | R2 uploads |
| `CLOUDFLARE_ZONE_ID` | Optional DNS shortcut |

### AI / product (unchanged by migrate)

`MAIN_API_KEY_GROK`, `GROK_SWARM_API_KEY`, `GROK_TTS_NEW_API_KEY`, `V0_API_KEY`, `PENCIL_API_KEY`, Stripe keys, etc.

---

## Non-goals for Phase 0–1 (this PR)

- No Docker / Cloudflare Containers deploy
- No DNS cutover
- No Workers rewrite
- No deleting Render services
- No committing `.env` or connection passwords
- No Phase 6 R2 workspace migration

---

## Next Agent session (Phase 3)

Dockerfile for `server.ts` + `vite build`, deploy notes for Cloudflare Containers (fallback Fly), using **Neon** `DATABASE_URL`, health check `GET /api/config`.
