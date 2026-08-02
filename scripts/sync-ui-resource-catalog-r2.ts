/**
 * Sync nebulla-project/ui-resource-catalog → Cloudflare R2 (profiles + index.json).
 * Dry-run without R2: lists profiles only.
 *
 *   npm run ui-resources:sync-r2
 *   npm run ui-resources:sync-r2 -- --dry-run
 */
import path from "path";
import { isR2Configured } from "../lib/nebulaR2Storage.ts";
import {
  catalogRootFromCwd,
  listProfilesFs,
  syncFsCatalogToR2,
} from "../lib/uiGenerationEngine/resources/catalogStore.ts";

const dry = process.argv.includes("--dry-run");
const root = catalogRootFromCwd(process.cwd());
const profiles = await listProfilesFs(root);
console.log(`Catalog root: ${root}`);
console.log(`Profiles: ${profiles.length}`);
for (const p of profiles) {
  console.log(`  - ${p.id} (${p.platform}/${p.page_types.join(",")}) → ${p.template_id || "—"}`);
}

if (dry) {
  console.log("Dry-run — no R2 upload.");
  process.exit(0);
}

if (!isR2Configured()) {
  console.error(
    "R2 not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME (or R2_* aliases). Use --dry-run to list only.",
  );
  process.exit(1);
}

const result = await syncFsCatalogToR2(root);
console.log(`Uploaded ${result.uploaded} profiles. Index: ${result.index_key}`);
