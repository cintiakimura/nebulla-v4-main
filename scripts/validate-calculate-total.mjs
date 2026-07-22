/**
 * Post-code validation for calculateTotal (property-based style + edge cases).
 * Run: node scripts/validate-calculate-total.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.join(__dirname, "../nebulla-project/examples/calculateTotal.ts");

// Load via tsx-compatible dynamic import of compiled-in-memory is hard;
// use a tiny pure JS mirror for the buggy / fixed contract by importing with tsx register.
async function loadFn() {
  try {
    const url = pathToFileURL(modPath).href;
    const mod = await import(url);
    return mod.calculateTotal;
  } catch {
    // Fallback: evaluate the same logic inline if TS import fails without loader
    const { register } = await import("node:module");
    // Use tsx if available via process already running under tsx
    throw new Error("Import failed — run with: npx tsx scripts/validate-calculate-total.mjs");
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runEdgeCases(calculateTotal) {
  const failures = [];

  // Edge: empty array
  try {
    const r = calculateTotal([]);
    if (typeof r !== "number" || Number.isNaN(r)) {
      failures.push({ case: "empty array", error: `got ${r} (expected finite 0)` });
    } else if (r !== 0) {
      failures.push({ case: "empty array", error: `got ${r} (expected 0)` });
    }
  } catch (e) {
    failures.push({ case: "empty array", error: String(e?.message || e) });
  }

  // Edge: null items (caller may pass bad data) — must coerce to 0, not throw
  try {
    const r = calculateTotal(null);
    if (r !== 0) {
      failures.push({ case: "null items", error: `got ${r} (expected 0)`, category: "Runtime Errors / null-undefined" });
    }
  } catch (e) {
    failures.push({
      case: "null items",
      error: String(e?.message || e),
      category: "Runtime Errors / null-undefined",
    });
  }

  // Edge: array with undefined element — skip hole, sum valid prices
  try {
    const r = calculateTotal([{ price: 10 }, undefined]);
    if (r !== 10) {
      failures.push({
        case: "undefined element",
        error: `got ${r} (expected 10)`,
        category: "Runtime Errors / null-undefined",
      });
    }
  } catch (e) {
    failures.push({
      case: "undefined element",
      error: String(e?.message || e),
      category: "Runtime Errors / null-undefined",
    });
  }

  // Edge: negative prices (should sum, not crash)
  try {
    const r = calculateTotal([{ price: 10 }, { price: -3 }]);
    if (r !== 7) failures.push({ case: "negative prices", error: `got ${r} expected 7` });
  } catch (e) {
    failures.push({ case: "negative prices", error: String(e?.message || e) });
  }

  return failures;
}

/** Property-based style: random arrays of finite prices; invariants. */
function runPropertyTests(calculateTotal, rounds = 40) {
  const failures = [];
  for (let i = 0; i < rounds; i++) {
    const n = Math.floor(Math.random() * 8); // 0..7
    const items = Array.from({ length: n }, () => ({
      price: Math.round((Math.random() * 200 - 50) * 100) / 100,
    }));
    let result;
    try {
      result = calculateTotal(items);
    } catch (e) {
      failures.push({ prop: "no-crash", n, error: String(e?.message || e) });
      continue;
    }
    // Invariant: result is finite number
    if (typeof result !== "number" || !Number.isFinite(result)) {
      failures.push({ prop: "finite", n, result });
      continue;
    }
    // Invariant: equals manual sum
    const expected = items.reduce((s, it) => s + it.price, 0);
    if (Math.abs(result - expected) > 1e-9) {
      failures.push({ prop: "sum-equals", n, result, expected });
    }
    // Invariant: empty → 0
    if (n === 0 && result !== 0) {
      failures.push({ prop: "empty-zero", result });
    }
  }
  return failures;
}

async function main() {
  const calculateTotal = await loadFn();
  console.log("--- Edge cases ---");
  const edge = runEdgeCases(calculateTotal);
  for (const f of edge) console.log("FAIL", JSON.stringify(f));
  if (edge.length === 0) console.log("Edge cases: PASS");

  console.log("\n--- Property-based (40 rounds) ---");
  const props = runPropertyTests(calculateTotal);
  for (const f of props.slice(0, 8)) console.log("FAIL", JSON.stringify(f));
  if (props.length === 0) console.log("Property tests: PASS");
  else console.log(`Property tests: ${props.length} failure(s)`);

  if (edge.length || props.length) {
    console.log("\nVALIDATION_FAILED");
    process.exit(1);
  }
  console.log("\nAll tests passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
