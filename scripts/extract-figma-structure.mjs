/**
 * Build lean committed structure extracts from full raw downloads (or seed shortlist).
 *
 * Usage:
 *   node scripts/extract-figma-structure.mjs
 *   node scripts/extract-figma-structure.mjs --seed-missing
 *   node scripts/extract-figma-structure.mjs --key=MaFREMBRF3vQ8BhtqA2ZpK
 *
 * Writes: nebulla-project/figma-library/structure/<fileKey>/document.json
 * Safe to commit (no secrets; layout tree only).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractStructureForKey } from "./lib/figma-structure-extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const LIBRARY = path.join(REPO, "nebulla-project", "figma-library");
const RAW = path.join(LIBRARY, "raw");
const OUT = path.join(LIBRARY, "structure");
const EXAMPLE = path.join(LIBRARY, "figma-keys.example.csv");

const SHORTLIST = [
  {
    bucket: "mobile",
    key: "ZEbJpC67UQyeeynt1UR8gT",
    name: "Mobile UI kit (structure)",
  },
  {
    bucket: "landing",
    key: "P6lA9sHTHVbnmUfoYbV9Ir",
    name: "Landing SaaS (structure)",
  },
  {
    bucket: "dashboard",
    key: "TgYmEqMwrWFHBxF2kAVOaF",
    name: "Dashboard SaaS (structure)",
  },
  {
    bucket: "auth",
    key: "MaFREMBRF3vQ8BhtqA2ZpK",
    name: "Auth kit (structure)",
  },
];

function seedDoc(bucket, name) {
  const spacing = bucket === "landing" ? 24 : bucket === "dashboard" ? 16 : 14;
  const radius = bucket === "auth" ? 12 : 16;
  if (bucket === "auth") {
    return {
      name,
      document: {
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            name: "iPhone Auth Login",
            type: "FRAME",
            layoutMode: "VERTICAL",
            itemSpacing: spacing,
            cornerRadius: radius,
            children: [
              { name: "Header Auth Title", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 8 },
              {
                name: "Form Card",
                type: "FRAME",
                layoutMode: "VERTICAL",
                itemSpacing: 12,
                cornerRadius: radius,
                children: [
                  { name: "Email Field", type: "FRAME", layoutMode: "HORIZONTAL" },
                  { name: "Password Field", type: "FRAME", layoutMode: "HORIZONTAL" },
                  {
                    name: "Primary CTA Button",
                    type: "FRAME",
                    layoutMode: "HORIZONTAL",
                    cornerRadius: 100,
                  },
                  { name: "Secondary Link", type: "FRAME", layoutMode: "HORIZONTAL" },
                ],
              },
            ],
          },
        ],
      },
    };
  }
  if (bucket === "landing") {
    return {
      name,
      document: {
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            name: "Desktop Landing Hero",
            type: "FRAME",
            layoutMode: "VERTICAL",
            itemSpacing: spacing,
            cornerRadius: radius,
            children: [
              { name: "Nav Header", type: "FRAME", layoutMode: "HORIZONTAL", itemSpacing: 16 },
              {
                name: "Hero CTA",
                type: "FRAME",
                layoutMode: "VERTICAL",
                itemSpacing: 16,
                children: [
                  { name: "Hero Title", type: "FRAME", layoutMode: "VERTICAL" },
                  { name: "Primary CTA Button", type: "FRAME", layoutMode: "HORIZONTAL" },
                ],
              },
              {
                name: "Feature Card Group",
                type: "FRAME",
                layoutMode: "HORIZONTAL",
                itemSpacing: 16,
                children: [
                  { name: "Feature Card", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 8 },
                  { name: "Feature Card", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 8 },
                  { name: "Feature Card", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 8 },
                ],
              },
            ],
          },
        ],
      },
    };
  }
  if (bucket === "dashboard") {
    return {
      name,
      document: {
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            name: "Desktop Dashboard",
            type: "FRAME",
            layoutMode: "HORIZONTAL",
            itemSpacing: spacing,
            children: [
              { name: "Sidebar Nav", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 12 },
              {
                name: "Main Content",
                type: "FRAME",
                layoutMode: "VERTICAL",
                itemSpacing: spacing,
                children: [
                  { name: "Page Header", type: "FRAME", layoutMode: "HORIZONTAL" },
                  {
                    name: "Metric Card Row",
                    type: "FRAME",
                    layoutMode: "HORIZONTAL",
                    itemSpacing: 12,
                    children: [
                      { name: "Metric Card", type: "FRAME", layoutMode: "VERTICAL" },
                      { name: "Metric Card", type: "FRAME", layoutMode: "VERTICAL" },
                      { name: "Metric Card", type: "FRAME", layoutMode: "VERTICAL" },
                    ],
                  },
                  {
                    name: "List Card Group",
                    type: "FRAME",
                    layoutMode: "VERTICAL",
                    itemSpacing: 10,
                    cornerRadius: radius,
                  },
                ],
              },
            ],
          },
        ],
      },
    };
  }
  // mobile default
  return {
    name,
    document: {
      name: "Document",
      type: "DOCUMENT",
      children: [
        {
          name: "iPhone Home",
          type: "FRAME",
          layoutMode: "VERTICAL",
          itemSpacing: spacing,
          cornerRadius: radius,
          children: [
            { name: "Page Header", type: "FRAME", layoutMode: "HORIZONTAL", itemSpacing: 8 },
            {
              name: "Content Blocks",
              type: "FRAME",
              layoutMode: "VERTICAL",
              itemSpacing: 16,
              children: [
                { name: "Card List", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 12 },
                { name: "Primary CTA Button", type: "FRAME", layoutMode: "HORIZONTAL" },
              ],
            },
            {
              name: "iOS/Bottom Bar/Tabs",
              type: "FRAME",
              layoutMode: "HORIZONTAL",
              itemSpacing: 8,
            },
          ],
        },
      ],
    },
  };
}

function writeStructure(key, data) {
  const dir = path.join(OUT, key);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "document.json");
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  const kb = (fs.statSync(p).size / 1024).toFixed(1);
  console.log(`wrote ${path.relative(REPO, p)} (${kb} KB)`);
}

const seedMissing = process.argv.includes("--seed-missing");
const keyArg = process.argv.find((a) => a.startsWith("--key="));
const onlyKey = keyArg ? keyArg.slice("--key=".length).trim() : "";

if (onlyKey) {
  const r = extractStructureForKey(LIBRARY, onlyKey);
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(`wrote ${path.relative(REPO, r.path)}`);
  console.log("done");
  process.exit(0);
}

for (const row of SHORTLIST) {
  const rawPath = path.join(RAW, row.key, "document.json");
  if (fs.existsSync(rawPath)) {
    const r = extractStructureForKey(LIBRARY, row.key);
    if (!r.ok) {
      console.error(`${row.key}: ${r.error}`);
      continue;
    }
    console.log(`wrote ${path.relative(REPO, r.path)}`);
  } else if (seedMissing) {
    writeStructure(row.key, seedDoc(row.bucket, row.name));
  } else {
    console.log(`skip ${row.key} (no raw; pass --seed-missing for lean seed)`);
  }
}

if (!fs.existsSync(EXAMPLE)) {
  console.warn("example CSV missing — shortlist keys are hardcoded in this script");
}
console.log("done");
