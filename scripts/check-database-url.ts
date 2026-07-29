/**
 * Safe DATABASE_URL diagnostics — never prints userinfo/password.
 *
 * Usage: npm run check:database-url
 * Exit 0 = host looks usable; exit 1 = missing/truncated/invalid shape.
 */
import "dotenv/config";

function hostOnly(raw: string): string {
  const m = raw.trim().match(/@([^/?#:]+)/);
  return m?.[1] || "";
}

function isTruncatedRenderPgHost(host: string): boolean {
  return Boolean(host && !host.includes(".") && /^dpg-[a-z0-9-]+$/i.test(host));
}

function main(): void {
  const raw = (process.env.DATABASE_URL || "").trim();
  if (!raw) {
    console.error("FAIL: DATABASE_URL is not set.");
    console.error("Set a Neon or Render External URL (host must contain dots).");
    console.error("See docs/migration/render-to-cloudflare.md");
    process.exit(1);
  }

  if (!/^postgres(ql)?:\/\//i.test(raw)) {
    console.error("FAIL: DATABASE_URL must start with postgresql:// or postgres://");
    process.exit(1);
  }

  const host = hostOnly(raw);
  if (!host) {
    console.error("FAIL: could not parse host from DATABASE_URL");
    process.exit(1);
  }

  const hasSslMode = /[?&]sslmode=/i.test(raw);
  const looksNeon = /\.neon\.tech$/i.test(host) || host.includes(".neon.");
  const looksRenderExternal = /\.postgres\.render\.com$/i.test(host);
  const truncated = isTruncatedRenderPgHost(host);

  console.log("DATABASE_URL diagnostics (safe):");
  console.log("  host:", host);
  console.log("  host_has_dots:", host.includes("."));
  console.log("  truncated_render_internal:", truncated);
  console.log("  looks_neon:", looksNeon);
  console.log("  looks_render_external:", looksRenderExternal);
  console.log("  has_sslmode_query:", hasSslMode);
  if (process.env.DATABASE_RENDER_REGION?.trim()) {
    console.log("  DATABASE_RENDER_REGION:", process.env.DATABASE_RENDER_REGION.trim());
  }

  if (truncated) {
    console.error("");
    console.error("FAIL: hostname looks like a truncated Render Internal id (dpg-… with no domain).");
    console.error("Use Neon (…neon.tech) or Render External (…frankfurt-postgres.render.com).");
    console.error("See docs/migration/render-to-cloudflare.md Phase 1.");
    process.exit(1);
  }

  if (!host.includes(".")) {
    console.error("FAIL: host must include a domain (dots).");
    process.exit(1);
  }

  if (looksNeon && !hasSslMode) {
    console.warn("WARN: Neon URLs usually include ?sslmode=require");
  }

  console.log("");
  console.log("OK: host shape looks usable. Restart the app and check /api/config → cloudStorageReady.");
  process.exit(0);
}

main();
