/**
 * Thin entry for daily-capped Figma ingest (see figma-ingest-daily.ts).
 * Prefer: npm run figma:ingest-daily
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, "figma-ingest-daily.ts");
const child = spawn("npx", ["tsx", script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, ".."),
  env: process.env,
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 1));
