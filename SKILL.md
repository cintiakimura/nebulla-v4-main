---
name: pencil-design
description: >
  Create high-quality visual designs â€” websites, app screens, dashboards, slides, marketing materials, social media graphics â€” using the Pencil CLI tool. Use this skill whenever the user wants to create, generate, or visualize any kind of UI design, mockup, wireframe, layout, webpage, app screen, presentation slide, poster, banner, or marketing asset. Also use it when the user says things like "design me a...", "make a visual for...", "create a mockup of...", "what would X look like?", or wants to turn an idea into a visual. Even if the user doesn't mention "Pencil" or "design tool" explicitly â€” if they want something visual created, this is the skill to use.
---

# Pencil Design

Create professional visual designs from natural language descriptions using the Pencil CLI. Pencil is a headless design tool that generates `.pen` files (a structured JSON design format) and can export them as images.

## Setup

Before designing, make sure the Pencil CLI is available.

### Check installation

```bash
which pencil || npx pencil version
```

If `pencil` is not found, install it:

```bash
npm install -g @pencil.dev/cli
```

If global install fails due to permissions, install locally instead:

```bash
npm install @pencil.dev/cli
```

Then run it via `npx pencil` (or `./node_modules/.bin/pencil`) instead of `pencil`.
You can learn about the available commands via the `pencil --help` command.

### Authentication

#### Pencil user

To use the CLI, an authenticated user logged in to Pencil is required. First, check
the current user configuration on the machine with the `pencil status` command.

If not logged in, there are the following options:

- use `pencil signup --email you@example.com --username johndoe --name "John Doe"` command, to create a new user.
- use `pencil login --email you@example.com [--code abc123]` to authenticate an existing or newly created user.
- optionally, the `PENCIL_CLI_KEY` env var can also be used for authentication if its set in your session.

#### Claude Code agent

The CLI needs auth to run its AI agent for which Claude Code is required. For that
there needs to be an authenticated Claude Code user set in the system configuration
either via env var or a user subscription.

If none of these are available, tell the user what options they have and help them set one up.

### Staying up to date

This skill stays in sync with the **Pencil CLI npm package** (`@pencil.dev/cli`). The published package includes `SKILL.md` at its root; the package version is the skill version.

**Check for a newer CLI / skill**

- Latest version on the registry: `npm view @pencil.dev/cli version`
- Installed CLI: `pencil version`, or `npm list -g @pencil.dev/cli` (global) / `npm list @pencil.dev/cli` (project)

**Upgrade the CLI**, then refresh your copied skill file (agents do not auto-update skill files you placed in config folders):

```bash
npm install -g @pencil.dev/cli
```

**Where to copy the skill from after installing**

- From a dependency tree: `node_modules/@pencil.dev/cli/SKILL.md` (path is the same for global and local installs; resolve from your project root or global `node_modules` prefix).

**Fetch the same file without cloning the repo** (mirrors the npm tarball; optional third-party CDNs):

- `https://unpkg.com/@pencil.dev/cli@latest/SKILL.md`
- `https://cdn.jsdelivr.net/npm/@pencil.dev/cli@latest/SKILL.md`

Use `@latest` for the newest publish, or pin (e.g. `@0.2.4`) for a reproducible snapshot.

**If you donâ€™t know where skills live on this machine**

Agents donâ€™t always get the skills directory from context. When the path isnâ€™t obvious:

- **Ask the user** where their agent or IDE loads skills from, or where they want this skill installed.
- **Check the productâ€™s docs** for â€œskillsâ€, â€œagent skillsâ€, or â€œpluginsâ€ â€” paths differ by tool and version.
- You can still **use the skill content without installing**: fetch or open the **`SKILL.md` URL above** (unpkg/jsDelivr) in the session so guidance applies even when the on-disk path is unknown. For a persistent install, copy the fetched file into the path the user or docs specify.

**Typical skill locations** (confirm with your toolâ€™s current docs â€” layouts change):

| Environment | Where to put `SKILL.md` |
|-------------|-------------------------|
| **Cursor** | Project: `.cursor/skills/pencil-design/SKILL.md`; user-level: under `~/.cursor/skills/` |
| **Claude Code** | Often `.claude/skills/pencil-design/SKILL.md` or user-level under `~/.claude/` |
| **OpenClaw** | Often `~/.openclaw/skills/`, workspace `.agents/skills/`, or paths in [OpenClaw skills docs](https://docs.openclaw.ai/skills/) â€” verify for the userâ€™s setup |
| **Other agents (Codex, etc.)** | Use the directory your product uses for skills or prompts |

Example (adjust the destination path to match your agent):

```bash
curl -fsSL "https://unpkg.com/@pencil.dev/cli@latest/SKILL.md" -o .cursor/skills/pencil-design/SKILL.md
```

**When to check for an update**

- **Early in the session**, before the first Pencil design run (compare `npm view @pencil.dev/cli version` to the installed CLI), so you arenâ€™t following stale instructions.
- **Again** if the user says they upgraded the CLI, or if behavior doesnâ€™t match this doc (flags, auth, timing).
- **Not** before every single command â€” once per session is enough unless something changed or errors suggest a version mismatch.

## Creating a Design

The core command:

```bash
pencil --out <output.pen> --prompt "<design description>" --export <output.png> --export-scale 2
```

Key flags:
- `--out, -o` â€” where to save the `.pen` file (required)
- `--prompt, -p` â€” what to design (required)
- `--export, -e` â€” export an image of the result
- `--export-scale` â€” image resolution multiplier (use 2 for crisp output)
- `--export-type` â€” format: `png` (default), `jpeg`, `webp`, `pdf`
- `--in, -i` â€” start from an existing `.pen` file (for iteration)
- `--model, -m` â€” Claude model to use (defaults to Opus)

### Passing the Prompt

Pass the user's request directly as the prompt â€” do not expand, or add detail beyond what the user actually said. The Pencil CLI has its own AI designer agent that handles creative decisions like layout structure, color palettes, typography, spacing, and content. Adding your own design specifics on top of the user's request will conflict with the CLI agent's own judgment and produce worse results.

If the user says "make me a landing page for a coffee shop", the prompt should be exactly that â€” not a paragraph with hero sections, color palettes, and font choices you invented.

### Timing Expectations

Design generation is not instant â€” the CLI runs an AI agent that plans the layout, creates each element, and validates the result visually. Expect:

- **Simple designs** (a card, a single component): 1-2 minutes
- **Medium designs** (an app screen, a landing page section): 2-3 minutes
- **Complex designs** (full landing page, detailed dashboard): 3-5+ minutes

Let the user know upfront that generation will take a few minutes so they're not left wondering. Use a generous timeout (at least 600000ms / 10 minutes) when running the command.

### Showing the Result

After the command completes, read the exported image to show it to the user:

```bash
# The command exports to the path you specified
pencil --out design.pen --prompt "..." --export design.png --export-scale 2
```

Then use the Read tool on the exported PNG â€” it will render visually since you're a multimodal model.

Always show the image to the user after creating it. This is the whole point â€” they want to see the visual.

## Iterating on a Design

When the user wants changes to an existing design, use the `--in` flag to load the previous `.pen` file:

```bash
pencil --in design.pen --out design-v2.pen --prompt "Make the header larger and change the accent color to green" --export design-v2.png --export-scale 2
```

The agent will read the existing design and apply modifications rather than starting from scratch.

For quick successive iterations, keep a consistent naming pattern:
- `design.pen` â†’ `design-v2.pen` â†’ `design-v3.pen`
- Or use a single file: `--in design.pen --out design.pen` (overwrites)

## Working Directory

Save design files in the user's current working directory or a subdirectory like `designs/`. Don't use temp directories â€” the user will want to find and iterate on these files later.

## Nebula UI Studio Contract (Project-Specific)

These rules are mandatory for this repository and override generic workflow defaults when working on Nebula UI Studio artifacts.

### Source of Truth Files

- Prompt source file: `nebula-sysh-ui-sysh-studio.md`
- Prompt section key: `NEBULA_UI_STUDIO_PROMPT`
- UI code section key: `NEBULA_UI_STUDIO_CODE`

### Prompt and Generation Rules

- Pencil MUST read the design prompt from `nebula-sysh-ui-sysh-studio.md`, specifically from the `NEBULA_UI_STUDIO_PROMPT` section.
- Pencil MUST generate consistent UI across all pages using the design system defined in that prompt.
- Pencil may generate one page at a time or in small batches, but MUST eventually generate every page required by the page map.
- If the user makes changes manually or via chat, Pencil outputs must be updated to reflect those changes.

### Output Code Quality Rules

- Pencil output must be clean, production-ready code.
- Preferred implementation target is React + Tailwind when that is the active stack (or whatever stack the app is currently using).
- Generated UI should follow shared component patterns and remain visually/systemically consistent across pages.

### Write-Back Rules (Critical)

- After generating UI code, Pencil output must be written into the `NEBULA_UI_STUDIO_CODE` section of `nebula-sysh-ui-sysh-studio.md`.
- Pencil MUST NEVER modify the `NEBULA_UI_STUDIO_PROMPT` section.
- `NEBULA_UI_STUDIO_PROMPT` is treated as immutable input unless explicitly updated by Grok 4 prompt-generation flow.

### Grok 4 and Grok B Responsibilities

- Grok 4 must provide a comprehensive, non-code summary for Master Plan-facing communication.
- Grok B must write/fill Master Plan tabs using rich, formal formatting.
- For coding implementation, Grok code should use `nebula-sysh-ui-sysh-studio.md` as the source of truth, focusing on the UI code section (`NEBULA_UI_STUDIO_CODE`) rather than prompt prose.