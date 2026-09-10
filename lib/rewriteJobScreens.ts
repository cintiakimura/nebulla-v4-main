/**
 * After Foundation+Primary, screens read/write lib/mockStore.ts (local mock state).
 */

import fs from "fs";
import path from "path";
import { extractNamedRoutesFromPagesText, seedPagesFromGoal } from "./nebulaUiBrief";
import { extractNamedBrand, inferProductName, productNameFromPlan, readProductIdentity } from "./productIdentity";
import {
  buildProductMockStoreSource,
  inferProductMockKind,
  PRODUCT_MOCK_STORE_REL,
} from "./productMockStore";
import {
  isEducationProductGoal,
  looksLikeGenericContinueHome,
} from "./rewriteEducationKitHome";

const GENERIC_STUB_RE =
  /Interactive screen with mock data|Primary action works locally|Continue<\/button>/i;
const LEFTOVER_COPY_RE =
  /breads\.json|Today'?s breads|bikeStore|lessonStore/i;

function isDeliveryGoal(goal: string): boolean {
  return inferProductMockKind(goal) === "delivery";
}

function isShopGoal(goal: string): boolean {
  return inferProductMockKind(goal) === "shop";
}

function writeRel(workspaceRoot: string, rel: string, body: string): boolean {
  const abs = path.join(workspaceRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  if (prev === body) return false;
  fs.writeFileSync(abs, body, "utf8");
  return true;
}

function deliveryHomeJsx(): string {
  return `"use client";

import { useState } from "react";
import { acceptRequest, listItems } from "../lib/mockStore";

export default function Home() {
  const [, setTick] = useState(0);
  const items = listItems();
  return (
    <main>
      <h1>Open requests</h1>
      <p>Open requests. Set pickup and dropoff, then accept.</p>
      <ul>
        {items.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.status}</span>
            <button
              type="button"
              onClick={() => {
                acceptRequest(row.id);
                setTick((n) => n + 1);
              }}
            >
              Accept
            </button>
          </li>
        ))}
      </ul>
      <a href="/request">New request</a>
    </main>
  );
}
`;
}

function requestPageJsx(productName: string): string {
  const name = productName.replace(/`/g, "");
  return `"use client";

import { addRequest, acceptRequest } from "../../lib/mockStore";

export default function RequestPage() {
  return (
    <main>
      <h1>${name} request</h1>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.currentTarget);
          addRequest(String(fd.get("pickup") || ""), String(fd.get("dropoff") || ""));
          acceptRequest();
          window.location.href = "/";
        }}
      >
        <label>
          Pickup
          <input name="pickup" type="text" autoComplete="street-address" required />
        </label>
        <label>
          Dropoff
          <input name="dropoff" type="text" autoComplete="street-address" required />
        </label>
        <button type="submit">Accept request</button>
      </form>
    </main>
  );
}
`;
}

function shopHomeJsx(goal: string): string {
  const bakery = /baker|bakery|bread|loaf|grain/i.test(goal);
  const title = bakery ? "Today's loaves" : "Ready bikes";
  const lead = bakery
    ? "Today's breads. Place a pickup order."
    : "Ready bikes on the floor. Book a pickup or service slot.";
  const href = bakery ? "/order" : "/book";
  const cta = bakery ? "Place pickup order" : "Book slot";
  return `"use client";

import { listItems } from "../lib/mockStore";

export default function Home() {
  const items = listItems();
  return (
    <main>
      <h1>${title}</h1>
      <p>${lead}</p>
      <ul>
        {items.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.status}</span>
          </li>
        ))}
      </ul>
      <a href="${href}">${cta}</a>
    </main>
  );
}
`;
}

function bookPageJsx(): string {
  return `"use client";

import { addBooking } from "../../lib/mockStore";

export default function BookPage() {
  return (
    <main>
      <h1>Book slot</h1>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.currentTarget);
          addBooking(String(fd.get("name") || ""), String(fd.get("when") || ""));
          window.location.href = "/";
        }}
      >
        <label>
          Name
          <input name="name" type="text" required />
        </label>
        <label>
          When
          <input name="when" type="text" required />
        </label>
        <button type="submit">Book</button>
      </form>
    </main>
  );
}
`;
}

function mechanicPageJsx(): string {
  return `"use client";

import { useState } from "react";
import { listItems, markReady } from "../../lib/mockStore";

export default function MechanicPage() {
  const [, setTick] = useState(0);
  const items = listItems();
  return (
    <main>
      <h1>Mechanic</h1>
      <ul>
        {items.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.status}</span>
            <button
              type="button"
              onClick={() => {
                markReady(row.id);
                setTick((n) => n + 1);
              }}
            >
              Mark ready
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;
}

function educationHomeJsx(): string {
  return `"use client";

import { useState } from "react";
import { readMockState, startPractice } from "../lib/mockStore";

export default function Home() {
  const [state, setState] = useState(() => readMockState());
  return (
    <main>
      <h1>Home</h1>
      <p>One short lesson. Start when you are ready.</p>
      <p>Weekly streak</p>
      <p>Progress {state.progress}</p>
      <button
        type="button"
        onClick={() => {
          setState(startPractice());
        }}
      >
        Start practice
      </button>
      <a href="/teacher">Teacher</a>
    </main>
  );
}
`;
}

function teacherPageJsx(): string {
  return `"use client";

import { readMockState } from "../../lib/mockStore";

export default function TeacherPage() {
  const state = readMockState();
  return (
    <main>
      <h1>Teacher</h1>
      <p>Progress {state.progress}</p>
      <ul>
        {state.items.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.status}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;
}

function looksStubOrLeftover(src: string): boolean {
  const s = String(src || "");
  if (!s.trim()) return true;
  return GENERIC_STUB_RE.test(s) || LEFTOVER_COPY_RE.test(s);
}

function needsMockWire(src: string): boolean {
  return !/from ["'].*lib\/mockStore["']/.test(src);
}

/** Fill §4 screens with this job's fields + mockStore verb. */
export function rewriteJobScreensIfNeeded(input: {
  workspaceRoot: string;
  goal?: string;
  plan?: Record<string, unknown>;
}): { rewritten: string[] } {
  const goal =
    (input.goal || "").trim() ||
    String(input.plan?.["1. Goal of the app"] || input.plan?.goal || "").trim();
  if (!goal) return { rewritten: [] };
  const pages = String(input.plan?.["4. Pages and navigation"] || "");
  const named = extractNamedRoutesFromPagesText(pages);
  const routes = named.length > 0 ? named : seedPagesFromGoal(goal);
  const productName =
    readProductIdentity(input.workspaceRoot)?.projectName ||
    productNameFromPlan(input.plan) ||
    extractNamedBrand(goal) ||
    inferProductName(goal) ||
    "App";
  const rewritten: string[] = [];
  const delivery = isDeliveryGoal(goal);
  const education = isEducationProductGoal(goal);
  const shop = isShopGoal(goal);
  const kind = inferProductMockKind(goal, productName);

  if (writeRel(input.workspaceRoot, PRODUCT_MOCK_STORE_REL, buildProductMockStoreSource(kind))) {
    rewritten.push(PRODUCT_MOCK_STORE_REL);
  }

  const pageRels = ["app/page.tsx", "src/app/page.tsx"];
  for (const rel of pageRels) {
    const abs = path.join(input.workspaceRoot, rel);
    if (!fs.existsSync(abs) && rel !== "app/page.tsx") continue;
    if (!fs.existsSync(abs) && !delivery && !education && !shop) continue;
    try {
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      const should =
        !prev ||
        needsMockWire(prev) ||
        looksLikeGenericContinueHome(prev) ||
        looksStubOrLeftover(prev) ||
        (delivery && /Ready bikes|Today'?s breads|short lesson/i.test(prev));
      if (!should) continue;
      const next = education
        ? educationHomeJsx()
        : delivery
          ? deliveryHomeJsx()
          : shop
            ? shopHomeJsx(goal)
            : prev;
      if (next && next !== prev && writeRel(input.workspaceRoot, rel, next)) rewritten.push(rel);
    } catch {
      /* skip */
    }
  }

  if (delivery) {
    const wantsRequest = routes.some((r) => /request/i.test(`${r.route} ${r.name}`));
    const prefer = wantsRequest
      ? routes.find((r) => /request/i.test(`${r.route} ${r.name}`))?.route || "/request"
      : "/request";
    const rel = prefer === "/requests" ? "app/requests/page.tsx" : "app/request/page.tsx";
    const abs = path.join(input.workspaceRoot, rel);
    let prev = "";
    try {
      if (fs.existsSync(abs)) prev = fs.readFileSync(abs, "utf8");
    } catch {
      prev = "";
    }
    if (!prev || looksStubOrLeftover(prev) || needsMockWire(prev) || !/name=["']pickup["']/.test(prev)) {
      if (writeRel(input.workspaceRoot, rel, requestPageJsx(productName))) rewritten.push(rel);
    }
  }

  if (shop) {
    const bakery = /baker|bakery|bread|loaf|grain/i.test(`${goal} ${productName}`);
    const actionRel = bakery ? "app/order/page.tsx" : "app/book/page.tsx";
    const wantsAction = routes.some((r) => /book|slot|order|pickup/i.test(`${r.route} ${r.name}`));
    if (wantsAction || /spoke|bike|baker|loaf/i.test(`${goal} ${productName}`)) {
      const abs = path.join(input.workspaceRoot, actionRel);
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      if (!prev || needsMockWire(prev) || looksStubOrLeftover(prev)) {
        if (writeRel(input.workspaceRoot, actionRel, bookPageJsx())) rewritten.push(actionRel);
      }
    }
    const wantsMech = routes.some((r) => /mechanic/i.test(`${r.route} ${r.name}`));
    if (wantsMech) {
      const abs = path.join(input.workspaceRoot, "app/mechanic/page.tsx");
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      if (!prev || needsMockWire(prev) || looksStubOrLeftover(prev)) {
        if (writeRel(input.workspaceRoot, "app/mechanic/page.tsx", mechanicPageJsx())) {
          rewritten.push("app/mechanic/page.tsx");
        }
      }
    }
  }

  if (education && /\bteacher/i.test(goal + pages)) {
    const rel = "app/teacher/page.tsx";
    const abs = path.join(input.workspaceRoot, rel);
    const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
    if (!prev || needsMockWire(prev) || looksStubOrLeftover(prev)) {
      if (writeRel(input.workspaceRoot, rel, teacherPageJsx())) rewritten.push(rel);
    }
  }

  return { rewritten };
}

export function looksLikeGenericStubScreen(src: string): boolean {
  return GENERIC_STUB_RE.test(String(src || ""));
}
