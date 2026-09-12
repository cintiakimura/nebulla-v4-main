/**
 * After Foundation+Primary, screens read/write lib/mockStore.ts (local mock state).
 */

import fs from "fs";
import path from "path";
import { extractNamedRoutesFromPagesText, isActionVerbRoute, seedPagesFromGoal } from "./nebulaUiBrief";
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
  /breads\.json|Today'?s breads|bikeStore|lessonStore|Crumb Market|Grain Bakery|Jobs as gigs|dummy list/i;
const DUMMY_LIST_BODY_RE =
  /First item|Second item|First listing|Second listing|Ready now|This afternoon/i;

export function looksLikeDummyListBody(src: string): boolean {
  const s = String(src || "");
  if (!s.trim()) return false;
  const hits = (s.match(/First item|Second item|First listing|Second listing|Ready now|This afternoon/gi) || []).length;
  return DUMMY_LIST_BODY_RE.test(s) && hits >= 2;
}

function isDeliveryGoal(goal: string): boolean {
  return inferProductMockKind(goal) === "delivery";
}

function isShopGoal(goal: string): boolean {
  return inferProductMockKind(goal) === "shop";
}

function isCreatorGoal(goal: string): boolean {
  return inferProductMockKind(goal) === "creator";
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

function trackPageJsx(): string {
  return `"use client";

import { listItems } from "../../lib/mockStore";

export default function TrackPage() {
  const items = listItems();
  const last = items[0];
  return (
    <main>
      <h1>Track</h1>
      <p>Last point (mock). Maps stay fake until a key is pasted.</p>
      <p><strong>{last ? last.title : "No request yet"}</strong></p>
      <p>{last ? last.status : ""}</p>
      <p>Pin: Harbor dock · updated just now</p>
    </main>
  );
}
`;
}

function payPageJsx(): string {
  return `"use client";

export default function PayPage() {
  return (
    <main>
      <h1>Pay</h1>
      <p>Saved card stays in this browser. No Stripe until you paste a key.</p>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          window.localStorage.setItem("nebulla_mock_card", "4242");
          window.location.href = "/";
        }}
      >
        <label>
          Card
          <input name="card" type="text" placeholder="4242 4242 4242 4242" required />
        </label>
        <label>
          Name
          <input name="name" type="text" required />
        </label>
        <button type="submit">Save card</button>
      </form>
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
          const last4 = String(fd.get("card") || "").replace(/\\D/g, "").slice(-4);
          if (last4) window.localStorage.setItem("nebulla_mock_card", last4);
          window.location.href = "/track";
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
        <section>
          <h2>Pay</h2>
          <p>Quote 8.50 (mock). Saved card stays in this browser.</p>
          <label>
            Card
            <input name="card" type="text" placeholder="4242 4242 4242 4242" />
          </label>
        </section>
        <button type="submit">Accept request</button>
      </form>
    </main>
  );
}
`;
}

function driverPageJsx(): string {
  return `"use client";

import { useState } from "react";
import { acceptRequest, listItems } from "../../lib/mockStore";

export default function DriverPage() {
  const [, setTick] = useState(0);
  const items = listItems();
  return (
    <main>
      <h1>Driver</h1>
      <p>Accept a parcel run. Not a shop Wallet.</p>
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
    </main>
  );
}
`;
}

function accountPageJsx(): string {
  return `"use client";

export default function AccountPage() {
  return (
    <main>
      <h1>Account</h1>
      <section>
        <h2>Pay</h2>
        <p>Quote on the last job. Saved card stays in this browser.</p>
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.currentTarget);
            window.localStorage.setItem(
              "nebulla_mock_card",
              String(fd.get("card") || "").replace(/\\D/g, "").slice(-4) || "4242",
            );
            window.location.href = "/";
          }}
        >
          <label>
            Card
            <input name="card" type="text" placeholder="4242 4242 4242 4242" required />
          </label>
          <button type="submit">Save card</button>
        </form>
      </section>
    </main>
  );
}
`;
}

function shopHomeJsx(goal: string): string {
  const bakery = /baker|bakery|bread|loaf|grain/i.test(goal);
  const bike = /bike|bicycle|spoke|mechanic/i.test(goal);
  const title = bakery ? "Today's loaves" : bike ? "Ready bikes" : "Catalog";
  const lead = bakery
    ? "Today's breads. Place a pickup order."
    : bike
      ? "Ready bikes on the floor. Book a pickup or service slot."
      : "Browse the catalog. Book or order from local stock.";
  const href = bakery ? "/order" : bike ? "/book" : "/catalog";
  const cta = bakery ? "Place pickup order" : bike ? "Book slot" : "Open catalog";
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

function catalogPageJsx(): string {
  return `"use client";

import { listItems } from "../../lib/mockStore";

export default function CatalogPage() {
  const items = listItems();
  return (
    <main>
      <h1>Catalog</h1>
      <p>Local stock. Book or order without a vendor SDK.</p>
      <ul>
        {items.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.status}</span>
          </li>
        ))}
      </ul>
      <a href="/book">Book</a>
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

function creatorHomeJsx(): string {
  return `"use client";

import { listItems } from "../lib/mockStore";

export default function Home() {
  const items = listItems();
  return (
    <main>
      <h1>Creators and brands</h1>
      <p>Profiles, rates, and outreach both ways.</p>
      <ul>
        {items.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.status}</span>
          </li>
        ))}
      </ul>
      <a href="/discover">Discover</a>
      <a href="/brand">Brand outreach</a>
    </main>
  );
}
`;
}

function creatorDiscoverJsx(): string {
  return `"use client";

import { listItems } from "../../lib/mockStore";

export default function DiscoverPage() {
  const items = listItems();
  return (
    <main>
      <h1>Discover</h1>
      <p>Creators with portfolio and rates.</p>
      <ul>
        {items.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.status}</span>
            <a href="/profile">Open profile</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;
}

function creatorBrandJsx(): string {
  return `"use client";

import { addOutreach } from "../../lib/mockStore";

export default function BrandPage() {
  return (
    <main>
      <h1>Brand</h1>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.currentTarget);
          addOutreach(String(fd.get("company") || ""), String(fd.get("budget") || ""));
          window.location.href = "/messages";
        }}
      >
        <label>
          Company
          <input name="company" type="text" required />
        </label>
        <label>
          Budget
          <input name="budget" type="text" required />
        </label>
        <label>
          Outreach
          <textarea name="note" required />
        </label>
        <button type="submit">Send outreach</button>
      </form>
    </main>
  );
}
`;
}

function creatorMessagesJsx(): string {
  return `"use client";

import { useState } from "react";
import { declineOffer, listItems } from "../../lib/mockStore";

export default function MessagesPage() {
  const [, setTick] = useState(0);
  const items = listItems();
  return (
    <main>
      <h1>Messages</h1>
      <p>Decline is an action on the offer — not a tab.</p>
      <ul>
        {items.map((row) => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <span>{row.status}</span>
            <button
              type="button"
              onClick={() => {
                declineOffer(row.id);
                setTick((n) => n + 1);
              }}
            >
              Decline
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;
}

function creatorPricingJsx(): string {
  return `"use client";

export default function PricingPage() {
  return (
    <main>
      <h1>Pricing</h1>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          window.location.href = "/profile";
        }}
      >
        <label>
          Rate
          <input name="rate" type="text" placeholder="$1,200 / post" required />
        </label>
        <button type="submit">Save rate</button>
      </form>
    </main>
  );
}
`;
}

function creatorProfileJsx(): string {
  return `"use client";

export default function ProfilePage() {
  return (
    <main>
      <h1>Profile</h1>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          window.location.href = "/";
        }}
      >
        <label>
          Portfolio
          <textarea name="portfolio" required />
        </label>
        <label>
          Rates
          <input name="rates" type="text" required />
        </label>
        <label>
          Contact
          <input name="contact" type="text" required />
        </label>
        <button type="submit">Save profile</button>
      </form>
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
  return GENERIC_STUB_RE.test(s) || LEFTOVER_COPY_RE.test(s) || looksLikeDummyListBody(s);
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
  const creator = isCreatorGoal(goal);
  const kind = inferProductMockKind(goal, productName);

  if (writeRel(input.workspaceRoot, PRODUCT_MOCK_STORE_REL, buildProductMockStoreSource(kind))) {
    rewritten.push(PRODUCT_MOCK_STORE_REL);
  }

  const pageRels = ["app/page.tsx", "src/app/page.tsx"];
  for (const rel of pageRels) {
    const abs = path.join(input.workspaceRoot, rel);
    if (!fs.existsSync(abs) && rel !== "app/page.tsx") continue;
    if (!fs.existsSync(abs) && !delivery && !education && !shop && !creator) continue;
    try {
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      const should =
        !prev ||
        needsMockWire(prev) ||
        looksLikeGenericContinueHome(prev) ||
        looksStubOrLeftover(prev) ||
        (delivery && /Ready bikes|Today'?s breads|short lesson|Crumb Market|Wallet/i.test(prev));
      if (!should) continue;
      const next = education
        ? educationHomeJsx()
        : delivery
          ? deliveryHomeJsx()
          : creator
            ? creatorHomeJsx()
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
    const trackRel = "app/track/page.tsx";
    const trackPrev = fs.existsSync(path.join(input.workspaceRoot, trackRel))
      ? fs.readFileSync(path.join(input.workspaceRoot, trackRel), "utf8")
      : "";
    if (!trackPrev || looksStubOrLeftover(trackPrev) || needsMockWire(trackPrev)) {
      if (writeRel(input.workspaceRoot, trackRel, trackPageJsx())) rewritten.push(trackRel);
    }
    const driverRel = "app/driver/page.tsx";
    const driverPrev = fs.existsSync(path.join(input.workspaceRoot, driverRel))
      ? fs.readFileSync(path.join(input.workspaceRoot, driverRel), "utf8")
      : "";
    if (!driverPrev || looksStubOrLeftover(driverPrev) || needsMockWire(driverPrev)) {
      if (writeRel(input.workspaceRoot, driverRel, driverPageJsx())) rewritten.push(driverRel);
    }
    const accountRel = "app/account/page.tsx";
    const accountPrev = fs.existsSync(path.join(input.workspaceRoot, accountRel))
      ? fs.readFileSync(path.join(input.workspaceRoot, accountRel), "utf8")
      : "";
    if (!accountPrev || looksStubOrLeftover(accountPrev) || needsMockWire(accountPrev)) {
      if (writeRel(input.workspaceRoot, accountRel, accountPageJsx())) rewritten.push(accountRel);
    }
    for (const leftover of [
      "app/wallet/page.tsx",
      "app/pay/page.tsx",
      "src/app/wallet/page.tsx",
      "app/discover/page.tsx",
      "app/decline/page.tsx",
    ]) {
      const abs = path.join(input.workspaceRoot, leftover);
      if (fs.existsSync(abs)) {
        try {
          fs.unlinkSync(abs);
          rewritten.push(leftover);
        } catch {
          /* skip */
        }
      }
    }
  }

  if (creator) {
    const map: Record<string, () => string> = {
      "/discover": creatorDiscoverJsx,
      "/brand": creatorBrandJsx,
      "/messages": creatorMessagesJsx,
      "/pricing": creatorPricingJsx,
      "/profile": creatorProfileJsx,
    };
    const want = routes.length ? routes : seedPagesFromGoal(goal);
    for (const p of want) {
      const fn = map[p.route];
      if (!fn) continue;
      const rel = p.route === "/" ? "app/page.tsx" : `app${p.route}/page.tsx`;
      const abs = path.join(input.workspaceRoot, rel);
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      if (!prev || needsMockWire(prev) || looksStubOrLeftover(prev)) {
        if (writeRel(input.workspaceRoot, rel, fn())) rewritten.push(rel);
      }
    }
    for (const leftover of ["app/decline/page.tsx", "src/app/decline/page.tsx"]) {
      const abs = path.join(input.workspaceRoot, leftover);
      if (fs.existsSync(abs)) {
        try {
          fs.unlinkSync(abs);
          rewritten.push(leftover);
        } catch {
          /* skip */
        }
      }
    }
  }

  if (shop) {
    const bakery = /baker|bakery|bread|loaf|grain/i.test(`${goal} ${productName}`);
    const wantsCatalog = routes.some((r) => /catalog/i.test(`${r.route} ${r.name}`));
    if (wantsCatalog) {
      const abs = path.join(input.workspaceRoot, "app/catalog/page.tsx");
      const prev = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      if (!prev || needsMockWire(prev) || looksStubOrLeftover(prev)) {
        if (writeRel(input.workspaceRoot, "app/catalog/page.tsx", catalogPageJsx())) {
          rewritten.push("app/catalog/page.tsx");
        }
      }
    }
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

  for (const rootRel of ["app", "src/app"]) {
    const root = path.join(input.workspaceRoot, rootRel);
    if (!fs.existsSync(root)) continue;
    const walk = (dir: string, segs: string[]) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full, [...segs, ent.name]);
          continue;
        }
        if (!/^page\.(tsx|jsx)$/.test(ent.name)) continue;
        const route = segs.length ? `/${segs.join("/")}` : "/";
        const rel = path.relative(input.workspaceRoot, full).replace(/\\/g, "/");
        if (isActionVerbRoute(route)) {
          try {
            fs.unlinkSync(full);
            rewritten.push(rel);
          } catch {
            /* skip */
          }
          continue;
        }
        try {
          const src = fs.readFileSync(full, "utf8");
          if (!looksLikeDummyListBody(src)) continue;
          if (creator && route === "/profile" && writeRel(input.workspaceRoot, rel, creatorProfileJsx())) {
            rewritten.push(rel);
          }
        } catch {
          /* skip */
        }
      }
    };
    walk(root, []);
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
