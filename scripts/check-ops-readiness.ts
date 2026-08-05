/**
 * Print ops readiness (no secrets). Exit 1 if production-blocking warnings.
 * Usage: npm run check:ops
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
  const { getOpsReadiness } = await import("../lib/opsReadiness");
  const ops = getOpsReadiness();
  console.log(JSON.stringify(ops, null, 2));

  const blocking = ops.warnings.filter(
    (w) =>
      w.includes("WORKSPACE_STORAGE=local on production") ||
      w.includes("APP_PREVIEW_PUBLIC=true") ||
      (w.includes("WORKSPACE_STORAGE needs R2") && process.env.NODE_ENV === "production"),
  );

  if (blocking.length && process.env.OPS_STRICT === "true") {
    console.error("\nFAIL — blocking ops warnings (OPS_STRICT=true)");
    process.exit(1);
  }
  if (ops.warnings.length) {
    console.log(`\n${ops.warnings.length} warning(s) — set OPS_STRICT=true to fail CI on production blockers`);
  } else {
    console.log("\nOK — no ops warnings");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
