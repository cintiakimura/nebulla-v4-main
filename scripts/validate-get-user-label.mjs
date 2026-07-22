import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.join(__dirname, "../nebulla-project/examples/getUserLabel.ts");

async function main() {
  const { getUserLabel } = await import(pathToFileURL(modPath).href);
  const cases = [
    [{ name: "Ada" }, "Ada"],
    [null, "Guest"],
    [undefined, "Guest"],
    [{ name: "  " }, "Guest"],
    [{ name: "  Bob  " }, "Bob"],
  ];
  for (const [input, expected] of cases) {
    const got = getUserLabel(input);
    if (got !== expected) {
      console.log("FAIL", { input, got, expected });
      process.exit(1);
    }
  }
  // property-ish: never throws on random
  for (let i = 0; i < 30; i++) {
    const u = Math.random() < 0.5 ? null : { name: Math.random() < 0.3 ? "" : `U${i}` };
    const r = getUserLabel(u);
    if (typeof r !== "string" || !r.length) {
      console.log("FAIL prop", r);
      process.exit(1);
    }
  }
  console.log("All tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
