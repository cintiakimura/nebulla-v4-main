#!/usr/bin/env node
/**
 * Grok chat smoke: HTTP checks for APIs used by IDE + Partner Grok flows.
 *
 * Usage:
 *   npm run test:grok
 *   TEST_BASE_URL=http://127.0.0.1:3001 npm run test:grok
 *
 * Heavy Grok pipelines (can run a long time — off by default):
 *   GROK_SMOKE_INCLUDE_HEAVY=1 npm run test:grok
 *
 * IDE Partner panel toolbar (no server calls — manual in browser):
 *   Voice activity, Raise hand, Microphone, Attach file, Go, Send message
 */

const base = (process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
const pq = "projectKey=default";
const TIMEOUT_MS = Number(process.env.GROK_SMOKE_TIMEOUT_MS) || 25_000;

function q(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${path}${sep}${pq}`;
}

async function jsonFetch(url, opts = {}) {
  const signal = opts.signal ?? AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(url, {
    ...opts,
    signal,
    headers: { Accept: "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 400) };
  }
  return { res, body };
}

function ok(name, pass, detail = "") {
  const mark = pass ? "✓" : "✗";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

function skip(name, reason) {
  console.log(`○ ${name} — ${reason}`);
}

/** Route responded (including upstream x.ai errors forwarded by our server). */
function grokChatSmokePass(status, body) {
  if (status === 200) return true;
  if ([401, 402, 400].includes(status)) return true;
  if (status === 404 && body && typeof body === "object" && typeof body.error === "string") return true;
  if (status === 429) return true;
  if (status >= 500 && status < 600 && body && typeof body === "object") return true;
  return false;
}

function isConnRefused(e) {
  const c = e?.cause ?? e;
  if (c?.code === "ECONNREFUSED") return true;
  if (e?.code === "ECONNREFUSED") return true;
  if (e?.name === "AbortError") return false;
  return String(e?.message || e).includes("ECONNREFUSED");
}

async function main() {
  console.log(`Grok chat API smoke → ${base} (timeout ${TIMEOUT_MS}ms)\n`);

  let hasKey = false;
  try {
    const health = await jsonFetch(`${base}/api/health`);
    ok("GET /api/health", health.res.ok, `status ${health.res.status}`);

    const cfg = await jsonFetch(q("/api/config"));
    hasKey = Boolean(cfg.body?.hasGrokApiKey);
    ok("GET /api/config", cfg.res.ok, `hasGrokApiKey=${hasKey}`);

    const mp = await jsonFetch(q("/api/master-plan/read"));
    ok("GET /api/master-plan/read", mp.res.ok || mp.res.status === 404, `status ${mp.res.status}`);

    const ui = await jsonFetch(q("/api/nebula-ui-studio/code"));
    ok("GET /api/nebula-ui-studio/code", ui.res.ok || ui.res.status === 404, `status ${ui.res.status}`);

    const conv = await jsonFetch(q("/api/conversation-log"));
    ok("GET /api/conversation-log", conv.res.ok, `status ${conv.res.status}`);

    const chatBody = {
      projectKey: "default",
      userId: "smoke-test",
      projectName: "Smoke",
      chatModel: "grok-4.1",
      onboardingAutopilot: false,
      messages: [
        { role: "system", content: "You are a test harness. Reply with exactly: OK" },
        { role: "user", content: "ping" },
      ],
    };

    let chat;
    try {
      chat = await jsonFetch(q("/api/grok/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatBody),
      });
    } catch (e) {
      if (e?.name === "AbortError") {
        ok("POST /api/grok/chat", false, `aborted after ${TIMEOUT_MS}ms`);
        chat = { res: { status: 0 }, body: {} };
      } else throw e;
    }
    const chatOk = grokChatSmokePass(chat.res.status, chat.body);
    const choice = chat.body?.choices?.[0]?.message?.content;
    ok(
      "POST /api/grok/chat",
      chatOk,
      `status ${chat.res.status}${choice ? ` preview="${String(choice).slice(0, 40)}…"` : chat.body?.error ? ` error=${String(chat.body.error).slice(0, 100)}` : ""}`,
    );

    if (process.env.GROK_SMOKE_INCLUDE_HEAVY === "1") {
      let goCode;
      try {
        goCode = await jsonFetch(q("/api/grok/go-code"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectKey: "default",
            userId: "smoke-test",
            projectName: "Smoke",
            messages: [{ role: "user", content: "noop" }],
          }),
        });
      } catch (e) {
        ok("POST /api/grok/go-code", false, e?.name === "AbortError" ? `timeout ${TIMEOUT_MS}ms` : String(e));
        goCode = { res: { status: 0 }, body: {} };
      }
      ok(
        "POST /api/grok/go-code",
        goCode.res.status === 200 || goCode.res.status === 401 || goCode.res.status === 400 || goCode.res.status === 500,
        `status ${goCode.res.status}`,
      );

      let execRules;
      try {
        execRules = await jsonFetch(q("/api/grok/execute-project-rules"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectKey: "default",
            userId: "smoke-test",
            projectName: "Smoke",
            messages: [{ role: "user", content: "noop" }],
          }),
        });
      } catch (e) {
        ok("POST /api/grok/execute-project-rules", false, e?.name === "AbortError" ? `timeout ${TIMEOUT_MS}ms` : String(e));
        execRules = { res: { status: 0 }, body: {} };
      }
      ok(
        "POST /api/grok/execute-project-rules",
        execRules.res.status === 200 ||
          execRules.res.status === 401 ||
          execRules.res.status === 400 ||
          execRules.res.status === 500,
        `status ${execRules.res.status}`,
      );
    } else {
      skip("POST /api/grok/go-code", "set GROK_SMOKE_INCLUDE_HEAVY=1 (long-running Grok Code path)");
      skip("POST /api/grok/execute-project-rules", "set GROK_SMOKE_INCLUDE_HEAVY=1 (long-running path)");
    }

    console.log("\n--- IDE Partner chat toolbar (manual browser QA, no API) ---");
    console.log("  • Voice activity — shows sidebar hint");
    console.log("  • Raise hand — shows hint");
    console.log("  • Microphone — shows hint");
    console.log("  • Attach file — shows hint");
    console.log("  • Go — sends message (same as Enter without Shift)");
    console.log("  • Send message — sends message");
    console.log("  Model label reads from top bar (not a button here).\n");

    const allStructural =
      health.res.ok &&
      cfg.res.ok &&
      conv.res.ok &&
      chatOk &&
      (mp.res.ok || mp.res.status === 404) &&
      (ui.res.ok || ui.res.status === 404);

    if (!hasKey && chat.res.status === 401) {
      console.log("Note: Server has no GROK_API_KEY (≥20 chars) — 401 on Grok POSTs is expected.\n");
    }
    if (hasKey && chat.res.status === 404 && String(chat.body?.error || "").includes("model")) {
      console.log(
        "Note: x.ai rejected the resolved model (often Free tier → Grok 3). Adjust env or tier; route + key still exercised.\n",
      );
    }

    process.exit(allStructural ? 0 : 1);
  } catch (e) {
    if (isConnRefused(e)) {
      console.error(`\n✗ Could not connect to ${base} (ECONNREFUSED).`);
      console.error("  Start the app: npm run dev   then: npm run test:grok\n");
      process.exit(1);
    }
    console.error(e);
    process.exit(1);
  }
}

main();
