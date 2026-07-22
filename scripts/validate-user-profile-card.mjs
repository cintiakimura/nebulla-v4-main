/**
 * Edge / property checks for UserProfileCard helpers + render safety.
 * Run: npx tsx scripts/validate-user-profile-card.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.join(__dirname, "../nebulla-project/examples/UserProfileCard.tsx");

async function main() {
  const mod = await import(pathToFileURL(modPath).href);
  const { UserProfileCard, normalizeUserProfile } = mod;

  const failures = [];

  // Helper must exist after fix; if only component, we still try render cases
  const cases = [
    null,
    undefined,
    { id: "1", name: "Ada", avatarUrl: null, bio: null, tags: null },
    { id: "2", name: "Bob", avatarUrl: "/a.png", bio: "Hi", tags: ["dev", "ts"] },
    { id: "3", name: "Cara", tags: [] },
  ];

  for (const user of cases) {
    try {
      const html = renderToString(React.createElement(UserProfileCard, { user }));
      if (typeof html !== "string" || !html.includes("rounded-xl")) {
        failures.push({ case: "render", user, error: "unexpected html" });
      }
      // Hydration risk signal: Date.now / Math.random in output markup of keys is hard to see;
      // we check normalize helper if present
      if (typeof normalizeUserProfile === "function") {
        const n = normalizeUserProfile(user);
        if (!n || typeof n.name !== "string") {
          failures.push({ case: "normalize", user, error: "bad normalize" });
        }
      }
    } catch (e) {
      failures.push({ case: "render-crash", user, error: String(e?.message || e) });
    }
  }

  // Property: many nullish users never crash
  for (let i = 0; i < 25; i++) {
    const user =
      Math.random() < 0.3
        ? null
        : {
            id: `u${i}`,
            name: Math.random() < 0.2 ? "" : `User${i}`,
            avatarUrl: Math.random() < 0.4 ? null : `/x${i}.png`,
            bio: Math.random() < 0.4 ? null : "bio",
            tags: Math.random() < 0.3 ? null : Math.random() < 0.3 ? [] : ["a", "b"],
          };
    try {
      renderToString(React.createElement(UserProfileCard, { user }));
    } catch (e) {
      failures.push({ case: "prop-crash", i, error: String(e?.message || e) });
    }
  }

  // Hydration stability: two SSR renders of same stable user should match (no Date.now/random)
  const stable = { id: "s", name: "Sam", avatarUrl: "/s.png", bio: "Hello", tags: ["one", "two"] };
  try {
    const a = renderToString(React.createElement(UserProfileCard, { user: stable }));
    const b = renderToString(React.createElement(UserProfileCard, { user: stable }));
    if (a !== b) {
      failures.push({
        case: "hydration-stable",
        error: "two identical props produced different HTML (Date.now/Math.random risk)",
      });
    }
  } catch (e) {
    failures.push({ case: "hydration-stable", error: String(e?.message || e) });
  }

  if (failures.length) {
    for (const f of failures.slice(0, 10)) console.log("FAIL", JSON.stringify(f));
    console.log("VALIDATION_FAILED");
    process.exit(1);
  }
  console.log("All tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
