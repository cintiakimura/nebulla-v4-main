import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.join(__dirname, "../nebulla-project/examples/SafeUserGreeting.tsx");

async function main() {
  const { SafeUserGreeting } = await import(pathToFileURL(modPath).href);
  const failures = [];

  const cases = [
    [{ name: "Ada" }, "Ada"],
    [null, "there"],
    [undefined, "there"],
    [{ name: "  " }, "there"],
  ];

  for (const [user, needle] of cases) {
    try {
      const html = renderToString(React.createElement(SafeUserGreeting, { user }));
      if (!html.includes(needle) && needle !== "there") {
        failures.push({ user, error: `missing ${needle}` });
      }
      if ((user == null || !String(user?.name || "").trim()) && !/there|Guest|friend/i.test(html)) {
        failures.push({ user, error: "null user should show friendly fallback", html });
      }
    } catch (e) {
      failures.push({ user, error: String(e?.message || e) });
    }
  }

  for (let i = 0; i < 20; i++) {
    const user = Math.random() < 0.5 ? null : { name: `U${i}` };
    try {
      renderToString(React.createElement(SafeUserGreeting, { user }));
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
