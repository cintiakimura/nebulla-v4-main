import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.join(__dirname, "../nebulla-project/examples/SafePriceDisplay.tsx");

async function main() {
  const { SafePriceDisplay } = await import(pathToFileURL(modPath).href);
  const failures = [];

  const cases = [
    { price: 12.5, expect: "12.50" },
    { price: 0, expect: "0.00" },
    { price: null, expect: "—" },
    { price: undefined, expect: "—" },
    { price: Number.NaN, expect: "—" },
  ];

  for (const c of cases) {
    try {
      const html = renderToString(React.createElement(SafePriceDisplay, { price: c.price }));
      if (!html.includes(c.expect)) {
        failures.push({ case: c, error: `expected ${c.expect}`, html });
      }
    } catch (e) {
      failures.push({ case: c, error: String(e?.message || e) });
    }
  }

  for (let i = 0; i < 30; i++) {
    const roll = Math.random();
    const price =
      roll < 0.25 ? null : roll < 0.4 ? undefined : Math.round((Math.random() * 200 - 20) * 100) / 100;
    try {
      const html = renderToString(React.createElement(SafePriceDisplay, { price }));
      if (typeof html !== "string" || !html.length) failures.push({ prop: i, error: "empty" });
    } catch (e) {
      failures.push({ prop: i, error: String(e?.message || e) });
    }
  }

  if (failures.length) {
    for (const f of failures.slice(0, 8)) console.log("FAIL", JSON.stringify(f));
    console.log("VALIDATION_FAILED");
    process.exit(1);
  }
  console.log("All tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
