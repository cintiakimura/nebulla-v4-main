# Nebulla

Architecture-first AI builder IDE (Plan → UI Studio Beta → code → preview).

**Beta:** see [BETA-STATUS.md](./BETA-STATUS.md) for what works, limitations, and invite posture.

## Run locally

**Prerequisites:** Node.js 20+ (22 recommended)

```bash
cp .env.example .env
# fill SESSION_SECRET, AI keys, and optional FIGMA_* / DB / R2
npm install
npm run dev
```

Open the URL printed by the server (default `http://localhost:3000`).

Useful scripts:

| Command | Purpose |
|---------|---------|
| `npm run lint` | Typecheck |
| `npm test` | Lint + smoke scripts + ops check |
| `npm run build` | Vite production build |
| `npm run check:ops` | Workspace/Figma/billing readiness (no secrets printed) |
| `npm run check:figma-refs` | Probe Figma reference keys |
| `npm run smoke:prod` | Remote health smoke |

Production boot refuses weak secrets, `APP_PREVIEW_PUBLIC=true`, and `WORKSPACE_STORAGE=local` (unless `ALLOW_LOCAL_WORKSPACE_IN_PRODUCTION=true`).

## Docs

- Trust / Phase 1: `docs/trust/`
- Figma references: `docs/figma-reference-library.md`
- Render ↔ Cloudflare hybrid: `docs/migration/render-to-cloudflare.md`
- Methodology: `nebula-project/`, guardian notes: `nebulla-project/`

## License / product

Private beta product (`nebulla`).
