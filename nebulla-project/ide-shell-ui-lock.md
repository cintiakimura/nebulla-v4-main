# Nebulla UI Lock — `ide-shell` branch

**Branch:** `ide-shell` (UI/UX redesign only)  
**Scope:** Global — landing, login, legal, payment, and IDE share one look via `AppShell`  
**Source of truth knobs:** `src/index.css` → `.nebulla-ide-shell` playground block  
**Shell wrapper:** `src/components/AppShell.tsx`  
**Testing flags:** `src/lib/testingBranch.ts` — `FORCE_GUEST_MODE` / `UI_SHELL_ONLY` default **false** (prod). Lab: `NEBULA_FORCE_GUEST=1`.

---

## Concept

Calm **frosted glass over a deep blue starfield**. Wallpaper always present; chrome and cards are translucent black with light blur so stars show through. Accents **cyan**; type **white, regular weight**. No card gradients, no button borders, no glow blooms.

### Layers

1. **Background** — full-bleed star photo + black veil  
2. **Cards / chrome** — frosted panels  
3. **Buttons** — subtle cyan wash, no border, white label/icon  

---

## Background tokens

| Token | Value |
|---|---|
| Image | `/images/background_nebulla_blue.png` via `--ide-bg-image` |
| Overlay | `--ide-bg-overlay: 0.5` |
| Layers | `.nebulla-ide-shell__bg`, `__veil`, content `__content` (z-index 2) |

Do **not** paint solid page backgrounds (`#020C17`, `#050508`, etc.) that hide the shell wallpaper.

---

## Glass tokens

| Token | Value |
|---|---|
| Blur | **7px** (`--ide-glass-blur` / `--ide-glass-blur-chrome`) |
| Chrome wash | ~28–35% black over blurred wallpaper |
| Card fills | soft ~0.18 / fill ~0.28 / strong ~0.40 |

**Classes:** `.ide-glass-chrome`, `.ide-glass-card`, `.ide-glass-input`  
Frost composites fixed wallpaper + blur + wash (not only `backdrop-filter`).  
Nested surfaces inside chrome must not sit as opaque solid black.  
No card gradients; `--gradient-active-tab: none`.

---

## Buttons

| Token | Value |
|---|---|
| Accent | `#22d3ee` (`--ide-btn-color` / `--ide-cyan` / `--primary`) |
| Fill | ~5% cyan; hover ~10% |
| Border | **none** |
| Text | white |

**Classes:** `.btn-cyan`, `.ide-btn`, `.btn-secondary-surface` (weaker secondary)  
Icon-only controls need `title` and/or `aria-label`.  
No cyan outer glow on buttons, focus rings, or shadows.

---

## Typography & seams

- Primary text: `#ffffff`
- Muted: ~78% white
- Interactive accent: cyan `#22d3ee`
- Weight: **regular only** (medium/semibold/bold forced to `400` in shell)
- Dividers: soft white ~12% (`rgba(255,255,255,0.12)`)

---

## Element kit

| Element | Must use |
|--------|----------|
| Primary action | `.btn-cyan` / `.ide-btn` |
| Secondary action | `.btn-secondary-surface` |
| Icon-only control | Same family + accessible name |
| Text field / textarea | `.ide-glass-input` |
| Content / feature / login / payment card | `.ide-glass-card` |
| Header, footer, nav, explorer, chat, terminal, tab strip | `.ide-glass-chrome` |
| Page body | Transparent to shell wallpaper |

---

## Testing flags

- `FORCE_GUEST_MODE` / `UI_SHELL_ONLY` — default off in production. Lab: `NEBULA_FORCE_GUEST=1` (guest workspace, skip auth, hide setup banners). Do not set on Render.

---

## Assets

- Active: `public/images/background_nebulla_blue.png`  
- Not default: `public/images/nebulla_black_bg.png`

---

## Do / don’t

**Do:** wallpaper through glass; kit classes; white regular type; cyan accents; icon-only + labels where established.  
**Don’t:** solid opaque chrome; card gradients; button borders; cyan glow; bold UI chrome; reintroduce setup nags while shell-only is on.
