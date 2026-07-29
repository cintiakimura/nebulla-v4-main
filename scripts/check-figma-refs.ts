/**
 * Probe FIGMA_API_KEY + FIGMA_REFERENCE_FILE_KEYS (never prints secrets).
 * Usage: npm run check:figma-refs
 */
import fs from "fs";
import path from "path";

function loadDotEnv(): void {
  const p = path.join(process.cwd(), ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  loadDotEnv();
  const token = (process.env.FIGMA_API_KEY || "").trim();
  const keys = (process.env.FIGMA_REFERENCE_FILE_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log("FIGMA_API_KEY:", token ? `set (len ${token.length}, prefix ${token.slice(0, 5)})` : "MISSING");
  console.log("FIGMA_REFERENCE_FILE_KEYS:", keys.length ? keys.join(", ") : "MISSING");

  if (!token) {
    console.log("\nFAIL — set FIGMA_API_KEY");
    process.exit(1);
  }

  const me = await fetch("https://api.figma.com/v1/me", {
    headers: { "X-Figma-Token": token },
  });
  console.log(
    `/v1/me: ${me.status}${me.status === 403 ? " (optional — fine without current_user:read)" : me.ok ? " PASS" : ""}`,
  );
  if (me.status === 401) {
    console.log("FAIL — token unauthorized");
    process.exit(1);
  }

  if (keys.length === 0) {
    console.log("\nFAIL — set FIGMA_REFERENCE_FILE_KEYS (see docs/figma-reference-library.md)");
    process.exit(1);
  }

  let okCount = 0;
  for (const fileKey of keys) {
    const fr = await fetch(
      `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=2`,
      { headers: { "X-Figma-Token": token } },
    );
    let name = "";
    if (fr.ok) {
      const data = (await fr.json()) as { name?: string };
      name = data.name || "";
      okCount += 1;
    }
    console.log(
      `${fr.ok ? "PASS" : "FAIL"}  file ${fileKey.slice(0, 12)}… → ${fr.status}${name ? ` (${name})` : ""}`,
    );
    if (fr.status === 404) {
      console.log("       hint: Community catalog IDs 404 — Duplicate into your account, use /design/<KEY>/");
    }
  }

  console.log(
    okCount > 0
      ? `\nALL NEEDED PASS — ${okCount}/${keys.length} file(s) readable`
      : "\nFAIL — no readable files",
  );
  process.exit(okCount > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
