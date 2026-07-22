/**
 * Post-code validation for calculateTotal.
 * Run: npx tsx scripts/validate-calculate-total.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.join(__dirname, "../nebulla-project/examples/calculateTotal.ts");

async function loadFn() {
  const mod = await import(pathToFileURL(modPath).href);
  return mod.calculateTotal;
}

function runEdgeCases(calculateTotal) {
  const failures = [];

  const cases = [
    { name: "empty array", input: [], expected: 0 },
    { name: "null array", input: null, expected: 0 },
    { name: "undefined array", input: undefined, expected: 0 },
    { name: "null item in list", input: [{ price: 10 }, null], expected: 10 },
    { name: "null price", input: [{ price: null }, { price: 5 }], expected: 5 },
    { name: "mixed", input: [{ price: 2.5 }, null, { price: null }, { price: -1 }], expected: 1.5 },
    { name: "negative prices", input: [{ price: 10 }, { price: -3 }], expected: 7 },
  ];

  for (const c of cases) {
    try {
      const r = calculateTotal(c.input);
      if (typeof r !== "number" || !Number.isFinite(r) || Math.abs(r - c.expected) > 1e-9) {
        failures.push({ case: c.name, error: `got ${r} expected ${c.expected}` });
      }
    } catch (e) {
      failures.push({ case: c.name, error: String(e?.message || e) });
    }
  }
  return failures;
}

function runPropertyTests(calculateTotal, rounds = 50) {
  const failures = [];
  for (let i = 0; i < rounds; i++) {
    const n = Math.floor(Math.random() * 8);
    const items = Array.from({ length: n }, () => {
      const roll = Math.random();
      if (roll < 0.15) return null;
      if (roll < 0.3) return { price: null };
      return { price: Math.round((Math.random() * 200 - 50) * 100) / 100 };
    });

    let result;
    try {
      result = calculateTotal(items);
    } catch (e) {
      failures.push({ prop: "no-crash", n, error: String(e?.message || e) });
      continue;
    }
    if (typeof result !== "number" || !Number.isFinite(result)) {
      failures.push({ prop: "finite", n, result });
      continue;
    }
    const expected = items.reduce((s, it) => {
      const p = it?.price;
      return s + (typeof p === "number" && Number.isFinite(p) ? p : 0);
    }, 0);
    if (Math.abs(result - expected) > 1e-9) {
      failures.push({ prop: "sum-equals", n, result, expected });
    }
    if (n === 0 && result !== 0) failures.push({ prop: "empty-zero", result });
  }
  return failures;
}

async function main() {
  const calculateTotal = await loadFn();
  console.log("--- Edge cases ---");
  const edge = runEdgeCases(calculateTotal);
  for (const f of edge) console.log("FAIL", JSON.stringify(f));
  if (!edge.length) console.log("Edge cases: PASS");

  console.log("\n--- Property-based (50 rounds) ---");
  const props = runPropertyTests(calculateTotal);
  for (const f of props.slice(0, 8)) console.log("FAIL", JSON.stringify(f));
  if (!props.length) console.log("Property tests: PASS");
  else console.log(`Property tests: ${props.length} failure(s)`);

  if (edge.length || props.length) {
    console.log("\nVALIDATION_FAILED");
    process.exit(1);
  }
  console.log("\nAll tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
