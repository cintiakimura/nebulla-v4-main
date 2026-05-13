#!/usr/bin/env node
/**
 * Quick production smoke: public endpoints only (no secrets).
 * Usage:
 *   npm run smoke:prod
 *   npm run smoke:prod -- https://other.example.com
 *   SMOKE_BASE_URL=https://nebula.dev node scripts/smoke-remote.mjs
 */
const baseArg = process.argv[2];
const base = (process.env.SMOKE_BASE_URL || baseArg || "https://nebula.dev").replace(/\/$/, "");

async function get(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { url, ok: res.ok, status: res.status, json, text: text.slice(0, 200) };
}

function main() {
  return (async () => {
    console.log(`Smoke test against ${base}\n`);

    const health = await get("/api/health");
    console.log(`GET /api/health  → ${health.status} ${health.ok ? "OK" : "FAIL"}`);
    if (health.json) console.log(JSON.stringify(health.json));

    const config = await get("/api/config");
    console.log(`\nGET /api/config → ${config.status} ${config.ok ? "OK" : "FAIL"}`);
    if (config.json) {
      const c = config.json;
      const pick = {
        cloudStorageReady: c.cloudStorageReady,
        githubOAuthReady: c.githubOAuthReady,
        workspaceMode: c.workspaceMode,
        githubClientId: c.githubClientId ? `${String(c.githubClientId).slice(0, 8)}…` : null,
      };
      console.log(JSON.stringify(pick, null, 2));
      if (c.githubOAuthReady === false) {
        console.log(
          "\nNote: githubOAuthReady is false — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the server."
        );
      }
      if (c.cloudStorageReady === false) {
        console.log("\nNote: cloudStorageReady is false — set DATABASE_URL on the server.");
      }
    } else {
      console.log(config.text);
    }

    const session = await get("/api/auth/session");
    console.log(`\nGET /api/auth/session → ${session.status} ${session.ok ? "OK" : "FAIL"}`);
    if (session.json) {
      console.log(session.json.user ? "user: signed-in session present" : "user: null (anonymous)");
    }

    if (!health.ok && health.status === 404) {
      console.log(
        "\n404: this host may not be your Nebulla API (wrong domain, static site only, or path not proxied). Try:\n  npm run smoke:prod -- https://YOUR-RENDER-SERVICE.onrender.com"
      );
    }

    const allOk = health.ok && config.ok && session.ok;
    process.exit(allOk ? 0 : 1);
  })();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
