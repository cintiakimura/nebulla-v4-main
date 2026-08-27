/**
 * Concrete §5 UI/UX + Stitch chrome — replaces "Industry-appropriate… mirror leading apps" filler.
 */

export function isGenericUiuxBoilerplate(text: string): boolean {
  const t = String(text || "");
  if (!t.trim()) return true;
  const hits = [
    /Industry-appropriate palette/i,
    /mirror leading apps in this space/i,
    /nav pattern from §4 \(sidebar vs top nav per category norms\)/i,
  ].filter((re) => re.test(t)).length;
  return hits >= 2 || (hits >= 1 && t.length < 420 && !/#[0-9a-fA-F]{3,8}/.test(t));
}

function detectDevice(goal: string, pages: string, tech: string): "mobile" | "web" | "landing" {
  const blob = `${goal}\n${pages}\n${tech}`.toLowerCase();
  if (/landing|marketing site|waitlist/.test(blob) && !/mobile|expo|react native/.test(blob)) {
    return "landing";
  }
  if (/mobile|expo|react native|kids?|child|adhd|classroom|tutor/.test(blob)) return "mobile";
  return "web";
}

function detectEducation(goal: string, tech: string): boolean {
  return /educat|learn|lesson|reading|tutor|adhd|classroom|school|kids?|child/i.test(
    `${goal}\n${tech}`,
  );
}

/**
 * 15–25 lines of real tokens + chrome rules (not Nebulla IDE, not vague filler).
 */
export function buildConcreteUiuxSection(input: {
  goal: string;
  pages: string;
  tech: string;
  projectName?: string;
}): string {
  const device = detectDevice(input.goal, input.pages, input.tech);
  const education = detectEducation(input.goal, input.tech);
  const adhd = /adhd|focus|attention|distract/i.test(`${input.goal}\n${input.tech}`);
  const name = (input.projectName || "App").trim().slice(0, 48);

  if (device === "mobile" && education) {
    return [
      `- **Project:** ${name} — mobile education (phone-first, touch ~44px)`,
      `- **Mood:** ${adhd ? "Calm, low-stimulus, one-task-at-a-time (ADHD-friendly)" : "Friendly, encouraging, child-safe"} — never Nebulla IDE chrome (#080A14 / #00D4D4)`,
      "- **Palette:** soft cream/off-white bg `#FFF8F1`, surface `#FFFFFF`, primary teal `#0F766E`, accent coral `#E11D48` (sparingly), text `#1C1917`, muted `#78716C`, success `#15803D`",
      "- **Typography:** large clear sans (titles 22–28px, body 16–18px); high contrast; short labels",
      "- **Density:** spacious; one primary action per screen; avoid dense admin tables on kid screens",
      "- **Radius / motion:** 16px cards; gentle 150–200ms fades; no neon glow or heavy shadows",
      "- **Header / identity:** 32–40px rounded mark with initials + product name — never the §1 goal sentence",
      `- **Logo:** initials ${name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() || "NP"} · book + spark (no image required; not a Go gate)`,
      "- **Navigation:** bottom tabs for kid flows (Home / Practice / Progress / Me); teacher/parent may use top segments",
      "- **Buttons:** one filled primary CTA (“Start practice”); secondary outline; min height 44px; verb-led labels",
      "- **Menus:** no hamburger clutter on kid home; settings behind Me/Profile",
      "- **Lists / cards:** large tappable cards for lessons; progress bar or streak strip under hero",
      "- **Auth:** Email/Password only on Login — never on Kid Home / practice screens",
      "- **Empty / error:** friendly illustration space + one recovery CTA; no raw stack traces",
      "- **Stitch chrome minimum:** identity top bar + content stack (≥2 sections) + primary CTA + tabs when multi-page",
    ].join("\n");
  }

  if (device === "landing") {
    return [
      `- **Project:** ${name} — marketing landing`,
      "- **Mood:** clear product story; one hero promise — not Nebulla IDE chrome",
      "- **Palette:** light bg `#FAFAF9`, primary `#0F766E`, text `#18181B`, muted `#71717A`",
      "- **Typography:** expressive display + readable body; strong hierarchy",
      "- **Density:** airy hero; one CTA group above the fold",
      "- **Header:** 32–40px rounded initials mark + product name + primary CTA; minimal nav links",
      "- **Buttons:** one primary Get started; secondary text link",
      "- **Stitch chrome minimum:** full-bleed hero region + CTA + supporting section — no auth fields in hero",
    ].join("\n");
  }

  return [
    `- **Project:** ${name} — web app workspace`,
    "- **Mood:** clean productivity UI from category norms — not Nebulla IDE chrome (#080A14 / #00D4D4)",
    "- **Palette:** bg `#F8FAFC`, surface `#FFFFFF`, primary `#0F766E`, text `#0F172A`, muted `#64748B`, border `#E2E8F0`",
    "- **Typography:** clear sans hierarchy; 14–16px body; accessible contrast",
    "- **Density:** medium; scannable cards; consistent 16px gaps",
    "- **Radius / motion:** 12px; subtle transitions",
    "- **Header / identity:** app top bar with 32–40px initials mark + product name (not the §1 goal)",
    "- **Navigation:** sidebar or top nav per §4 roles; active state obvious",
    "- **Buttons:** one primary per view; secondary ghost/outline",
    "- **Auth:** credentials only on auth routes",
    "- **Stitch chrome minimum:** identity + content regions + primary CTA + nav for multi-page apps",
  ].join("\n");
}

/** Always appended into ui-brief so UI Gen has explicit chrome rules. */
export function buildStitchChromeBriefSection(device: "mobile" | "web" | "landing"): string {
  const lines = [
    "## Stitch-minimum chrome (mandatory for UI Gen)",
    "",
    "Every product screen must include:",
    "1. **Identity** — top bar with initials mark + product name (not a route slug, not Email, not the goal sentence)",
    "2. **Content stack** — ≥2 real sections/cards/list rows with short labels",
    "3. **Primary CTA** — one verb-led button",
    "4. **Navigation** — bottom tabs (mobile multi-page) or sidebar/top nav (web); omit on auth/landing hero-only",
    "5. **Auth fields** — Email/Password **only** on Login/Sign-in pages",
    "6. **No Nebulla IDE chrome** — never Cosmic Night #080A14 / accent #00D4D4 / builder sidebar as the app theme",
    "",
  ];
  if (device === "mobile") {
    lines.push(
      "Mobile extras: phone frame, 44px touch targets, bottom tabs for kid/home flows, large lesson cards.",
      "",
    );
  }
  return lines.join("\n");
}

export function inferUiDevice(goal: string, pages: string, tech: string): "mobile" | "web" | "landing" {
  return detectDevice(goal, pages, tech);
}
