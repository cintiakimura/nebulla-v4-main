/**
 * Nebula Guardian — silent server-side error memory (admin-only hub).
 * Never exposed to end users; optional signed client reports for UI/runtime errors.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express, NextFunction, Request, Response } from "express";
import { getNebullaPersistRoot } from "../lib/nebulaWorkspaceRoot";

const DATA_DIR = path.join(getNebullaPersistRoot(), "guardian-data");
const STORE_PATH = path.join(DATA_DIR, "knowledge.json");

export type GuardianCategory =
  | "syntax"
  | "runtime"
  | "api"
  | "environment"
  | "port"
  | "package"
  | "render"
  | "vercel"
  | "ui"
  | "database"
  | "auth"
  | "network"
  | "unknown";

export type GuardianOccurrence = {
  at: string;
  source: "server" | "client" | "process";
  route?: string;
  detail?: string;
};

export type GuardianRecord = {
  fingerprint: string;
  category: GuardianCategory;
  messageSample: string;
  stackHead: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: GuardianOccurrence[];
  /** Last documented fix (human-entered in hub). */
  howFixed?: string;
  /** Prevention / runbook tip. */
  preventionTip?: string;
};

type GuardianStore = {
  records: Record<string, GuardianRecord>;
  /** MRU fingerprints (newest last). */
  order: string[];
};

const MAX_ORDER = 500;

function ensureStore(): GuardianStore {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
  if (!fs.existsSync(STORE_PATH)) {
    const empty: GuardianStore = { records: {}, order: [] };
    fs.writeFileSync(STORE_PATH, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const p = JSON.parse(raw) as GuardianStore;
    if (!p.records || !Array.isArray(p.order)) return { records: {}, order: [] };
    return p;
  } catch {
    return { records: {}, order: [] };
  }
}

function saveStore(store: GuardianStore) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("[Guardian] Failed to persist store:", e);
  }
}

export function fingerprintFromError(message: string, stack?: string): string {
  const head = (stack || "").split("\n").slice(0, 10).join("\n");
  return crypto.createHash("sha256").update(`${message}\n${head}`).digest("hex").slice(0, 24);
}

export function categorizeError(message: string, stack?: string): GuardianCategory {
  const m = `${message} ${stack || ""}`.toLowerCase();

  if (/syntaxerror|unexpected token|parse error|ts\(\d+\)/i.test(m)) return "syntax";
  if (/vercel|serverless|edge function/i.test(m)) return "vercel";
  if (/render\.com|render api|blueprint/i.test(m)) return "render";
  if (/eaddrinuse|port \d+|listen eacces/i.test(m)) return "port";
  if (/cannot find module|module_not_found|err_module_not_found|package/i.test(m)) return "package";
  if (
    /process\.env|environment|env var|missing api key|not set\. please/i.test(m)
  )
    return "environment";
  if (/supabase|postgres|sql|database|prisma|econnrefused.*5432/i.test(m)) return "database";
  if (/unauthorized|jwt|oauth|auth|forbidden|401|403/i.test(m)) return "auth";
  if (/fetch failed|econnrefused|enotfound|network|socket|axios|api\.x\.ai|429|502|503/i.test(m))
    return "api";
  if (/minified react|react\.|chunk load|hydration|did not match/i.test(m)) return "ui";
  if (/referenceerror|typeerror|rangeerror|cannot read prop/i.test(m)) return "runtime";

  return "unknown";
}

function stackHead(stack?: string, max = 1200): string {
  if (!stack) return "";
  return stack.slice(0, max);
}

export function captureError(
  err: unknown,
  opts: {
    source: GuardianOccurrence["source"];
    route?: string;
    detail?: string;
  }
): GuardianRecord | null {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const fp = fingerprintFromError(message, stack);
  const category = categorizeError(message, stack);
  const now = new Date().toISOString();

  const store = ensureStore();
  let rec = store.records[fp];
  const occ: GuardianOccurrence = {
    at: now,
    source: opts.source,
    route: opts.route,
    detail: opts.detail,
  };

  if (!rec) {
    rec = {
      fingerprint: fp,
      category,
      messageSample: message.slice(0, 2000),
      stackHead: stackHead(stack),
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrences: [occ],
    };
    store.records[fp] = rec;
    store.order.push(fp);
    if (store.order.length > MAX_ORDER) {
      const drop = store.order.shift();
      if (drop && store.records[drop]) delete store.records[drop];
    }
  } else {
    rec.count += 1;
    rec.lastSeenAt = now;
    rec.category = category;
    rec.occurrences.push(occ);
    if (rec.occurrences.length > 50) rec.occurrences = rec.occurrences.slice(-50);
  }

  saveStore(store);

  if (rec.count > 1 && (rec.howFixed || rec.preventionTip)) {
    console.warn(
      `[Nebula Guardian] Repeat incident (${rec.count}x) [${rec.category}] — documented fix available in hub for fingerprint ${fp}`
    );
    if (rec.howFixed) console.warn(`  Previous fix: ${rec.howFixed.slice(0, 400)}`);
  } else {
    console.error(`[Nebula Guardian] Captured [${category}] ${message.slice(0, 200)}`);
  }

  return rec;
}

export function recordFix(
  fingerprint: string,
  howFixed: string,
  preventionTip: string
): boolean {
  const store = ensureStore();
  const rec = store.records[fingerprint];
  if (!rec) return false;
  rec.howFixed = howFixed.trim();
  rec.preventionTip = preventionTip.trim();
  saveStore(store);
  return true;
}

export function getAllRecords(): GuardianRecord[] {
  const store = ensureStore();
  return [...store.order].map((fp) => store.records[fp]).filter(Boolean);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function queryString(req: Request, name: string): string {
  const q = req.query[name];
  if (typeof q === "string") return q;
  if (Array.isArray(q) && typeof q[0] === "string") return q[0];
  return "";
}

function checkHubSecret(req: Request): boolean {
  const secret = process.env.GUARDIAN_HUB_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    if (t.length === secret.length && timingSafeEqual(t, secret)) return true;
  }
  const q = queryString(req, "key");
  if (q.length === secret.length && timingSafeEqual(q, secret)) return true;
  return false;
}

function checkReportKey(req: Request): boolean {
  const key = process.env.GUARDIAN_REPORT_KEY?.trim();
  if (!key || key.length < 8) return false;
  const h = req.headers["x-guardian-key"];
  const sent = typeof h === "string" ? h.trim() : "";
  if (sent.length !== key.length) return false;
  return timingSafeEqual(sent, key);
}

export function guardianExpressErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  captureError(err, { source: "server", route: req.path });
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
}

let processHandlersInstalled = false;

export function initGuardianProcessHandlers() {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;
  process.on("unhandledRejection", (reason: unknown) => {
    captureError(reason instanceof Error ? reason : new Error(String(reason)), {
      source: "process",
      detail: "unhandledRejection",
    });
  });
  process.on("uncaughtException", (err) => {
    captureError(err, { source: "process", detail: "uncaughtException" });
    process.exit(1);
  });
}

const HUB_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nebula Guardian</title>
  <style>
    body { font-family: ui-sans-serif, system-ui; background: #0a0f14; color: #e2e8f0; margin: 0; padding: 1.5rem; }
    h1 { font-size: 1.25rem; color: #5eead4; }
    .muted { color: #94a3b8; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.8rem; }
    th, td { border: 1px solid #1e293b; padding: 0.5rem 0.4rem; text-align: left; vertical-align: top; }
    th { background: #0f172a; color: #94a3b8; }
    tr:nth-child(even) { background: #0f172a33; }
    code { color: #7dd3fc; word-break: break-all; }
    textarea { width: 100%; min-height: 56px; background: #020617; border: 1px solid #334155; color: #e2e8f0; padding: 0.4rem; border-radius: 4px; font-family: inherit; font-size: 0.8rem; }
    button { background: #0d9488; color: #042f2e; border: none; padding: 0.35rem 0.75rem; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.75rem; }
    button:hover { filter: brightness(1.1); }
    .cat { text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.05em; color: #a78bfa; }
    .warn { color: #fbbf24; }
  </style>
</head>
<body>
  <h1>Nebula Guardian — debug hub</h1>
  <p class="muted">Silent error memory. Not linked from the product UI.</p>
  <div id="app"></div>
  <script>
    const key = new URLSearchParams(location.search).get('key') || '';
    const hdr = key ? { 'Authorization': 'Bearer ' + key } : {};
    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    async function load() {
      const r = await fetch('/api/guardian/insights', { headers: hdr });
      if (!r.ok) { document.getElementById('app').textContent = 'Unauthorized or Guardian disabled. Set GUARDIAN_HUB_SECRET in .env and pass ?key=...'; return; }
      const data = await r.json();
      const rows = (data.records || []).slice().reverse();
      let html = '<table><thead><tr><th>When</th><th>Cat</th><th>Count</th><th>Message</th><th>Fix / Prevention</th><th></th></tr></thead><tbody>';
      for (const rec of rows) {
        const tip = esc((rec.preventionTip || '').slice(0, 400));
        const fix = esc((rec.howFixed || '').slice(0, 400));
        const repeat = rec.count > 1 && (rec.howFixed || rec.preventionTip) ? '<span class="warn"> (repeat — see fix)</span>' : '';
        html += '<tr><td><code>' + esc(rec.lastSeenAt || '') + '</code></td>';
        html += '<td><span class="cat">' + esc(rec.category || '') + '</span>' + repeat + '</td>';
        html += '<td>' + esc(String(rec.count)) + '</td>';
        html += '<td><code>' + esc((rec.messageSample || '').slice(0, 240)) + '</code></td>';
        html += '<td><small>Fix:</small><br/><code>' + fix + '</code><br/><small>Tip:</small><br/><code>' + tip + '</code></td>';
        html += '<td><form data-fp="' + esc(rec.fingerprint) + '"><textarea name="how" placeholder="How it was fixed"></textarea><textarea name="tip" placeholder="Avoid next time"></textarea><button type="submit">Save</button></form></td></tr>';
      }
      html += '</tbody></table>';
      document.getElementById('app').innerHTML = html;
      document.querySelectorAll('form[data-fp]').forEach(function(form) {
        form.onsubmit = async function(e) {
          e.preventDefault();
          const fd = new FormData(form);
          const fp = form.getAttribute('data-fp');
          await fetch('/api/guardian/insights/' + encodeURIComponent(fp) + '/fix', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, hdr),
            body: JSON.stringify({ howFixed: fd.get('how') || '', preventionTip: fd.get('tip') || '' })
          });
          load();
        };
      });
    }
    load();
  </script>
</body>
</html>`;

export function registerGuardianRoutes(app: Express) {
  app.post("/api/guardian/report", (req, res) => {
    if (!checkReportKey(req)) {
      return res.status(404).json({ error: "Not found" });
    }
    const { message, stack, url } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message required" });
    }
    const err = new Error(message);
    if (typeof stack === "string" && stack.trim()) {
      err.stack = `${message}\n${stack}`;
    }
    captureError(err, {
      source: "client",
      detail: [typeof url === "string" ? url : ""].filter(Boolean).join(" | "),
    });
    res.json({ ok: true });
  });

  app.get("/api/guardian/insights", (req, res) => {
    if (!checkHubSecret(req)) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ records: getAllRecords() });
  });

  app.post("/api/guardian/insights/:fingerprint/fix", (req, res) => {
    if (!checkHubSecret(req)) {
      return res.status(404).json({ error: "Not found" });
    }
    const { howFixed, preventionTip } = req.body || {};
    if (typeof howFixed !== "string" || typeof preventionTip !== "string") {
      return res.status(400).json({ error: "howFixed and preventionTip strings required" });
    }
    const ok = recordFix(req.params.fingerprint, howFixed, preventionTip);
    if (!ok) return res.status(404).json({ error: "Unknown fingerprint" });
    res.json({ ok: true });
  });

  app.get("/api/guardian/hub", (req, res) => {
    if (!checkHubSecret(req)) {
      return res.status(404).send("Not found");
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(HUB_HTML);
  });
}
