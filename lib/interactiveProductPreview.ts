/**
 * Interactive product preview (mock data) — working app output when the IDE
 * cannot run Vite/Next/Expo in the iframe.
 *
 * Path: public/product-preview/index.html
 * Label: Interactive preview (mock data) — not UI Gen mockup, not production SSR.
 */
import fs from "fs";
import path from "path";

export const PRODUCT_PREVIEW_REL = "public/product-preview/index.html";
export const PRODUCT_PREVIEW_MARKER = "interactive-product-preview";

export type PreviewScreenHint = {
  id: string;
  label: string;
  kind: "home" | "role" | "feature" | "upload" | "session";
};

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Infer clickable screens from product file paths (app/, pages/, components/). */
export function inferPreviewScreensFromPaths(productFiles: string[]): PreviewScreenHint[] {
  const joined = productFiles.map((p) => p.replace(/\\/g, "/").toLowerCase()).join("\n");
  const screens: PreviewScreenHint[] = [
    { id: "home", label: "Home", kind: "home" },
  ];

  const roles: Array<{ id: string; label: string; re: RegExp }> = [
    { id: "teacher", label: "Teacher", re: /teacher|educator|instructor/ },
    { id: "parent", label: "Parent", re: /parent|guardian|family/ },
    { id: "kid", label: "Kid", re: /\/kid\/|child|student|learner/ },
  ];
  for (const r of roles) {
    if (r.re.test(joined)) {
      screens.push({ id: `role-${r.id}`, label: r.label, kind: "role" });
    }
  }

  if (/tutor|buddy|session|lesson/i.test(joined)) {
    screens.push({ id: "tutor", label: "Tutor session", kind: "session" });
  }
  if (/reward|badge|streak|progress/i.test(joined)) {
    screens.push({ id: "rewards", label: "Rewards", kind: "feature" });
  }
  if (/upload|photo|capture|camera|image/i.test(joined)) {
    screens.push({ id: "upload", label: "Upload", kind: "upload" });
  }
  if (/login|auth|signin/i.test(joined) && !screens.some((s) => s.id.startsWith("role-"))) {
    screens.push({ id: "login", label: "Sign in", kind: "feature" });
  }

  // Dedupe by id
  const seen = new Set<string>();
  return screens.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function buildInteractiveHtml(opts: {
  projectName: string;
  productFiles: string[];
  screens: PreviewScreenHint[];
}): string {
  const name = esc((opts.projectName || "App").slice(0, 80));
  const screensJson = JSON.stringify(opts.screens);
  const filesSample = opts.productFiles
    .slice(0, 10)
    .map((f) => `<li><code>${esc(f)}</code></li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="nebulla-preview" content="${PRODUCT_PREVIEW_MARKER}"/>
  <title>${name} — Interactive preview</title>
  <style>
    :root { --bg:#F8FAFC; --card:#fff; --ink:#0F172A; --muted:#64748B; --line:#E2E8F0; --accent:#0F766E; --accent-soft:#CCFBF1; --warn:#B45309; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--ink); min-height:100vh; }
    .top { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--line); background:var(--card); position:sticky; top:0; z-index:2; }
    .badge { font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--accent); background:var(--accent-soft); padding:4px 8px; border-radius:999px; }
    .tabs { display:flex; flex-wrap:wrap; gap:6px; padding:10px 14px; }
    .tab { border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:999px; padding:6px 12px; font-size:12px; cursor:pointer; }
    .tab[aria-current="true"] { background:var(--accent); border-color:var(--accent); color:#fff; }
    .main { padding:16px; max-width:520px; margin:0 auto; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px; margin-bottom:12px; }
    h1 { font-size:1.35rem; margin:0 0 8px; }
    h2 { font-size:1.05rem; margin:0 0 8px; }
    p { margin:0 0 10px; color:var(--muted); line-height:1.45; font-size:14px; }
    .grid { display:grid; gap:10px; }
    .role { text-align:left; border:1px solid var(--line); border-radius:14px; padding:14px; background:#fff; cursor:pointer; width:100%; }
    .role:hover { border-color:var(--accent); }
    .role strong { display:block; color:var(--ink); margin-bottom:4px; }
    button.cta { background:var(--accent); color:#fff; border:0; border-radius:10px; padding:10px 14px; font-weight:600; cursor:pointer; font-size:13px; }
    button.cta:disabled, button.ghost:disabled { opacity:.45; cursor:not-allowed; }
    button.ghost { background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px 14px; cursor:pointer; font-size:13px; }
    .row { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    .toast { margin-top:10px; padding:8px 10px; border-radius:8px; background:#ECFDF5; color:#065F46; font-size:12px; display:none; }
    .toast.show { display:block; }
    .note { font-size:11px; color:var(--muted); margin-top:16px; }
    code { font-size:11px; background:#F1F5F9; padding:1px 4px; border-radius:4px; }
    .progress { height:8px; background:#E2E8F0; border-radius:999px; overflow:hidden; margin:10px 0; }
    .progress > i { display:block; height:100%; width:12%; background:var(--accent); }
    input[type=file] { font-size:12px; }
    .files { font-size:11px; color:var(--muted); }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <span class="badge">Interactive preview · mock data</span>
      <div style="font-weight:700;margin-top:4px">${name}</div>
    </div>
    <div id="roleChip" style="font-size:12px;color:var(--muted)">Role: guest</div>
  </div>
  <nav class="tabs" id="tabs" aria-label="Preview screens"></nav>
  <main class="main" id="root"></main>
  <p class="note" style="padding:0 16px 24px;max-width:520px;margin:0 auto">
    This is a <strong>working product preview</strong> with mock/local data so you can click the happy path inside Nebulla.
    It is not the UI Gen mockup and not a full Vite/Next runtime. Source of truth remains your coded files:
  </p>
  <ul class="files" style="max-width:520px;margin:0 auto 24px;padding:0 16px 24px">
${filesSample || "<li><code>(no product files listed)</code></li>"}
  </ul>
  <script>
(function () {
  var SCREENS = ${screensJson};
  var STORAGE_KEY = "nebulla_product_preview_v1";
  var state = { screen: "home", role: "guest", uploadName: "", progress: 12, sessionStarted: false };
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") state = Object.assign(state, saved);
  } catch (e) {}

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function toast(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function setRole(role) {
    state.role = role;
    persist();
    document.getElementById("roleChip").textContent = "Role: " + role;
  }

  function renderTabs() {
    var nav = document.getElementById("tabs");
    nav.innerHTML = "";
    SCREENS.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tab";
      b.textContent = s.label;
      if (state.screen === s.id) b.setAttribute("aria-current", "true");
      b.onclick = function () { state.screen = s.id; persist(); paint(); };
      nav.appendChild(b);
    });
  }

  function homeHtml() {
    var roles = SCREENS.filter(function (s) { return s.kind === "role"; });
    var roleButtons = roles.length
      ? roles.map(function (r) {
          var id = r.id.replace(/^role-/, "");
          return '<button type="button" class="role" data-role="' + id + '"><strong>' + r.label + '</strong><span style="color:#64748B;font-size:13px">Continue as ' + r.label.toLowerCase() + '</span></button>';
        }).join("")
      : '<button type="button" class="role" data-role="user"><strong>Continue</strong><span style="color:#64748B;font-size:13px">Enter the app</span></button>';
    return (
      '<div class="card">' +
        '<h1>Who are you today?</h1>' +
        '<p>Interactive preview with mock data. Pick a role to continue the happy path.</p>' +
        '<div class="grid">' + roleButtons + '</div>' +
        '<div class="toast" id="toast"></div>' +
      '</div>'
    );
  }

  function roleHtml(label) {
    var hasTutor = SCREENS.some(function (s) { return s.id === "tutor"; });
    var hasUpload = SCREENS.some(function (s) { return s.id === "upload"; });
    var hasRewards = SCREENS.some(function (s) { return s.id === "rewards"; });
    return (
      '<div class="card">' +
        '<h1>' + label + ' home</h1>' +
        '<p>Signed in as <strong>' + (state.role || "guest") + '</strong> (mock session).</p>' +
        '<div class="progress" aria-hidden="true"><i style="width:' + state.progress + '%"></i></div>' +
        '<p>Progress ' + state.progress + '% · mock data only</p>' +
        '<div class="row">' +
          (hasTutor ? '<button type="button" class="cta" id="goTutor">Start tutor session</button>' : '') +
          (hasUpload ? '<button type="button" class="ghost" id="goUpload">Upload lesson</button>' : '') +
          (hasRewards ? '<button type="button" class="ghost" id="goRewards">View rewards</button>' : '') +
          (!hasTutor && !hasUpload ? '<button type="button" class="cta" id="goHome">Back home</button>' : '') +
        '</div>' +
        '<div class="toast" id="toast"></div>' +
      '</div>'
    );
  }

  function tutorHtml() {
    return (
      '<div class="card">' +
        '<h1>Tutor session</h1>' +
        '<p>' + (state.sessionStarted ? "Session running with mock prompts." : "Ready when you are — mock buddy session.") + '</p>' +
        '<div class="row">' +
          '<button type="button" class="cta" id="startSession">' + (state.sessionStarted ? "Continue session" : "Start session") + '</button>' +
          '<button type="button" class="ghost" id="endSession"' + (state.sessionStarted ? "" : " disabled title=\\"Start a session first\\"") + '>End session</button>' +
        '</div>' +
        '<div class="toast" id="toast"></div>' +
      '</div>'
    );
  }

  function uploadHtml() {
    return (
      '<div class="card">' +
        '<h1>Upload</h1>' +
        '<p>Mock upload — file stays in this browser (localStorage). No real processing.</p>' +
        '<input type="file" id="fileInput" />' +
        '<p style="margin-top:10px">Last upload: <strong id="lastUpload">' + (state.uploadName || "none") + '</strong></p>' +
        '<div class="row"><button type="button" class="ghost" id="clearUpload">Clear upload</button></div>' +
        '<div class="toast" id="toast"></div>' +
      '</div>'
    );
  }

  function rewardsHtml() {
    return (
      '<div class="card">' +
        '<h1>Rewards</h1>' +
        '<p>Streak and badges are mock values for this preview.</p>' +
        '<p><strong>' + Math.max(1, Math.floor(state.progress / 4)) + '</strong> day streak · <strong>' + (state.sessionStarted ? 2 : 1) + '</strong> badges</p>' +
        '<div class="row"><button type="button" class="cta" id="claim">Claim mock badge</button></div>' +
        '<div class="toast" id="toast"></div>' +
      '</div>'
    );
  }

  function featureHtml(label) {
    return (
      '<div class="card">' +
        '<h1>' + label + '</h1>' +
        '<p>Interactive screen with mock data. Primary action works locally.</p>' +
        '<div class="row"><button type="button" class="cta" id="primaryAct">Continue</button></div>' +
        '<div class="toast" id="toast"></div>' +
      '</div>'
    );
  }

  function paint() {
    renderTabs();
    document.getElementById("roleChip").textContent = "Role: " + (state.role || "guest");
    var root = document.getElementById("root");
    var screen = SCREENS.find(function (s) { return s.id === state.screen; }) || SCREENS[0];
    if (!screen || screen.id === "home") root.innerHTML = homeHtml();
    else if (screen.kind === "role") root.innerHTML = roleHtml(screen.label);
    else if (screen.id === "tutor") root.innerHTML = tutorHtml();
    else if (screen.id === "upload") root.innerHTML = uploadHtml();
    else if (screen.id === "rewards") root.innerHTML = rewardsHtml();
    else root.innerHTML = featureHtml(screen.label);

    var t = document.getElementById("toast");
    root.querySelectorAll("[data-role]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var role = btn.getAttribute("data-role") || "user";
        setRole(role);
        var next = SCREENS.find(function (s) { return s.id === "role-" + role; });
        state.screen = next ? next.id : (SCREENS.find(function (s) { return s.kind === "session"; }) || SCREENS[0]).id;
        persist();
        toast(t, "Role set to " + role);
        paint();
      });
    });
    var goTutor = document.getElementById("goTutor");
    if (goTutor) goTutor.onclick = function () { state.screen = "tutor"; persist(); paint(); };
    var goUpload = document.getElementById("goUpload");
    if (goUpload) goUpload.onclick = function () { state.screen = "upload"; persist(); paint(); };
    var goRewards = document.getElementById("goRewards");
    if (goRewards) goRewards.onclick = function () { state.screen = "rewards"; persist(); paint(); };
    var goHome = document.getElementById("goHome");
    if (goHome) goHome.onclick = function () { state.screen = "home"; persist(); paint(); };
    var startSession = document.getElementById("startSession");
    if (startSession) startSession.onclick = function () {
      state.sessionStarted = true;
      state.progress = Math.min(100, state.progress + 8);
      persist();
      toast(document.getElementById("toast"), "Mock session started");
      paint();
    };
    var endSession = document.getElementById("endSession");
    if (endSession) endSession.onclick = function () {
      if (!state.sessionStarted) return;
      state.sessionStarted = false;
      persist();
      toast(document.getElementById("toast"), "Session ended (mock)");
      paint();
    };
    var fileInput = document.getElementById("fileInput");
    if (fileInput) fileInput.onchange = function () {
      var f = fileInput.files && fileInput.files[0];
      state.uploadName = f ? f.name : "";
      persist();
      toast(document.getElementById("toast"), state.uploadName ? "Stored " + state.uploadName : "No file");
      paint();
    };
    var clearUpload = document.getElementById("clearUpload");
    if (clearUpload) clearUpload.onclick = function () {
      state.uploadName = "";
      persist();
      paint();
    };
    var claim = document.getElementById("claim");
    if (claim) claim.onclick = function () {
      state.progress = Math.min(100, state.progress + 5);
      persist();
      toast(document.getElementById("toast"), "Badge claimed (mock)");
      paint();
    };
    var primaryAct = document.getElementById("primaryAct");
    if (primaryAct) primaryAct.onclick = function () {
      state.screen = "home";
      persist();
      paint();
    };
  }

  paint();
})();
  </script>
</body>
</html>
`;
}

export function hasInteractiveProductPreview(workspaceRoot: string): boolean {
  const abs = path.join(workspaceRoot, PRODUCT_PREVIEW_REL);
  if (!fs.existsSync(abs)) return false;
  try {
    const html = fs.readFileSync(abs, "utf8");
    return html.length > 80 && new RegExp(PRODUCT_PREVIEW_MARKER, "i").test(html);
  } catch {
    return false;
  }
}

export function ensureInteractiveProductPreview(
  workspaceRoot: string,
  options?: { projectName?: string; productFiles?: string[] },
): { written: boolean; path: string; screens: PreviewScreenHint[] } {
  const root = path.resolve(workspaceRoot);
  const productFiles = options?.productFiles?.length
    ? options.productFiles
    : [];
  // If caller didn't pass files, discover lightly from app/components/pages/src
  let files = productFiles;
  if (!files.length) {
    for (const top of ["app", "components", "pages", "src"]) {
      const abs = path.join(root, top);
      if (!fs.existsSync(abs)) continue;
      const walk = (dir: string, rel: string, depth: number) => {
        if (files.length >= 40 || depth > 4) return;
        let ents: fs.Dirent[];
        try {
          ents = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const ent of ents) {
          if (files.length >= 40) return;
          if (ent.name.startsWith(".")) continue;
          const nextRel = rel ? `${rel}/${ent.name}` : `${top}/${ent.name}`;
          if (ent.isDirectory()) {
            if (ent.name === "node_modules") continue;
            walk(path.join(dir, ent.name), nextRel, depth + 1);
          } else if (/\.(tsx|jsx)$/i.test(ent.name)) {
            files.push(nextRel.replace(/\\/g, "/"));
          }
        }
      };
      walk(abs, "", 0);
    }
  }

  const screens = inferPreviewScreensFromPaths(files);
  const html = buildInteractiveHtml({
    projectName: options?.projectName?.trim() || "App",
    productFiles: files,
    screens,
  });
  const outAbs = path.join(root, PRODUCT_PREVIEW_REL);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, html, "utf8");
  return { written: true, path: PRODUCT_PREVIEW_REL, screens };
}

/** Coding contract — dead controls are not allowed on the happy path. */
export const INTERACTIVE_PREVIEW_GO_BULLETS = `
WORKING APP OUTPUT (mandatory for product UI slices):
- After Foundation/Primary, the user must be able to **use** the happy path (click roles / start session / upload mock), not only see files in Explorer.
- Wire primary controls with mock/localStorage/in-memory state in the same slice. Silent no-op buttons are forbidden.
- If a control cannot ship in this slice: disable it and label why (e.g. "Next slice: real AI"). Never leave a primary CTA that does nothing.
- Nebulla may serve public/product-preview as an Interactive preview (mock data) when the iframe cannot run Vite/Next — still implement real client wiring in app/ source.
`.trim();
