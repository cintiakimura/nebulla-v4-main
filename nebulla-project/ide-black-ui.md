# Nebulla IDE — Black UI (design system)

Canonical visual language for the IDE shell (“black version”). Source of truth for colors lives in `src/index.css`. Rollback snapshot: `src/theme-backups/original-ui-2026-07-24/`.

## Intent

Calm, ChatGPT-like IDE chrome: **true black**, hairline seams, almost no fill hierarchy, rare accents. Layout, resize, and collapse behavior stay as-is — this doc is **visual only**.

Generated app previews (e.g. Cosmic Night mock content) may use their own palette. **IDE chrome must not**.

## Surfaces

| Token / role | Hex | Usage |
|---|---|---|
| Background / surface | `#000000` | App shell, explorer, terminal, chat, editor chrome |
| Elevated / hover | `#0a0a0a` | Popovers, modals, subtle raised panels |
| Highest / chip | `#111111` | Active rows, icon wells, soft fills |
| Hairline border | `#2e2e2e` | All panel seams, tabs, cards, live-activity boxes |
| Foreground | `#f2f2f2` | Primary text |
| Muted text | `#8a8a8a` | Labels, timestamps, secondary copy |

CSS variables: `--background`, `--surface*`, `--elevated`, `--border` / `--hairline`, `--foreground`, `--muted-foreground`.

## Accents (use sparingly)

| Role | Hex | CSS | When |
|---|---|---|---|
| Title / primary CTA | `#5750CC` | `--primary`, `--title` | Save, primary buttons, active spinner, rare emphasis |
| Subtitle | `#679BD1` | `--subtitle` | Soft informational highlights only |
| Misc / warn-soft | `#C6937C` | `--misc` | Soft warnings in activity log |
| Destructive | `#c45c5c` | `--destructive` | Errors, destructive confirms |
| Success (quiet) | `#6b9b7a` | `--success` | Soft success — prefer muted foreground when possible |

Do **not** use cyan (`#00D4D4`, Tailwind `cyan-*`), navy fills (`#050a14`, `#030712`, `#0a1628`, `#071422`), or slate-tinted blues for chrome.

## Typography & weight

- Prefer **normal** weight over bold in chrome.
- Headings: existing `font-headline` / type scale classes.
- Logs / code: monospace (`font-mono`), small (~10–11px).
- Section labels: uppercase, wide tracking, muted (e.g. “LIVE ACTIVITY”).

## Borders & radius

- Borders: **1px** solid `#2e2e2e` (`border-border`).
- Radius: ~`0.75rem` (`--radius`) for panels; phone frames may use larger radii.
- Avoid multi-layer shadows and glow. Ambient popover shadow only when needed (`--shadow-ambient-popover`).

## Layout regions (chrome)

1. **Top bar** — black; logo ~43px (~90% of 48px header height), max-height guarded.
2. **Explorer / nav** — black; hairline separators.
3. **Main workspace tabs** — inactive flat; active tab thin light border, no heavy fill.
4. **Editor / UI Studio** — black canvas and properties; no navy blue panels.
5. **Terminal** — black.
6. **Chat / activity** — black; rounded live-activity box with hairline border. **No v0 status block** in chat (keeps space for Live Activity + messages).

## Components

### Live activity (chat)

- Container: `rounded-xl border border-border bg-black`.
- Label: uppercase muted.
- Entries: mono timestamps + quiet message colors (success → foreground/80; error → soft red; warn → `--misc`).

### Buttons

- Primary: `bg-primary` / `#5750CC`.
- Secondary: border + black / `#0a0a0a` hover `#111111`.
- No cyan CTAs in IDE chrome.

### Modals

- `bg-[#0a0a0a]` or `bg-popover`, `border-border`.
- Title: `text-foreground` (not cyan-tinted whites).

## Do / don’t

**Do**

- Match explorer / terminal black everywhere in chrome.
- Use tokens (`bg-background`, `border-border`, `text-muted-foreground`, `bg-primary`) over one-off hex when possible.
- Keep accents rare.

**Don’t**

- Navy / blue-grey panel backgrounds in IDE chrome.
- Cyan gradients, cyan text links, or cyan CTAs for shell UI.
- Large status blocks in chat (especially v0 key/prompt readiness).
- Cards or heavy shadows that compete with content.

## File map

| Concern | Location |
|---|---|
| Theme tokens | `src/index.css` |
| Chat activity UI | `src/components/ide/IdeGrokActivityPanel.tsx` |
| UI Studio Beta chrome | `src/components/ide/IdeUiStudioBeta.tsx` |
| Classic visual editor chrome | `src/components/ide/IdeVisualEditor.tsx` |
| Pre-black backup | `src/theme-backups/original-ui-2026-07-24/` |

## Preview content vs chrome

Phone/desktop **preview node styles** (e.g. `#080A14`, `#00D4D4` in default demo models) are **product content**, not IDE chrome. Changing those is a design-of-generated-app concern, not this shell theme.
