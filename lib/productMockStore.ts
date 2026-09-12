/**
 * Product-workspace lib/mockStore.ts — localStorage, same Go as Foundation+Primary.
 * No empty /api stubs. Ready = the goal verb mutates this store.
 */

export const PRODUCT_MOCK_STORE_REL = "lib/mockStore.ts";

export type ProductMockKind = "delivery" | "shop" | "education" | "creator" | "other";

export function inferProductMockKind(goal: string, productName = ""): ProductMockKind {
  const blob = `${goal} ${productName}`;
  if (/\b(moto|motodrop|courier|delivery|dropoff)\b/i.test(blob)) return "delivery";
  if (
    /\b(creator|influencer|outreach|portfolio)\b/i.test(blob) ||
    (/\bbrand/.test(blob.toLowerCase()) && /\b(marketplace|creator|profile)\b/i.test(blob))
  ) {
    return "creator";
  }
  if (/\b(bike|bicycle|spoke|baker|bakery|bread|shop|store|marketplace|loaflocal|grain)\b/i.test(blob)) {
    return "shop";
  }
  if (/\b(learn|lesson|tutor|reading|adhd|classroom|homework|student|teacher|kids? education|practice)\b/i.test(blob)) {
    return "education";
  }
  return "other";
}

/** Ready check: store exposes the verb for this kind. */
export function mockStoreHasPrimaryVerb(src: string, kind: ProductMockKind): boolean {
  const s = String(src || "");
  if (kind === "delivery") return /export function addRequest/.test(s) && /export function acceptRequest/.test(s);
  if (kind === "shop") return /export function addBooking/.test(s) && /export function markReady/.test(s);
  if (kind === "education") return /export function startPractice/.test(s);
  if (kind === "creator") return /export function addOutreach/.test(s) && /export function declineOffer/.test(s);
  return /export function addItem/.test(s);
}

export function buildProductMockStoreSource(kind: ProductMockKind): string {
  return `/** Local mock store — Foundation+Primary. No /api. Survives refresh via localStorage. */
export type MockItem = {
  id: string;
  title: string;
  status: string;
  pickup?: string;
  dropoff?: string;
  when?: string;
};

export type MockState = {
  items: MockItem[];
  progress: number;
};

const KEY = "nebulla_product_mock_v1";
const KIND = ${JSON.stringify(kind)};

function uid() {
  return "m" + Math.random().toString(36).slice(2, 9);
}

function seed(): MockState {
  if (KIND === "delivery") {
    return {
      items: [
        { id: "r1", title: "Harbor to Midtown", status: "Waiting for a rider", pickup: "Harbor", dropoff: "Midtown" },
        { id: "r2", title: "Depot to North side", status: "Ready to accept", pickup: "Depot", dropoff: "North side" },
      ],
      progress: 0,
    };
  }
  if (KIND === "shop") {
    return {
      items: [
        { id: "b1", title: "City commuter", status: "Ready now — pickup today" },
        { id: "b2", title: "Trail hardtail", status: "Tuned this morning" },
      ],
      progress: 0,
    };
  }
  if (KIND === "education") {
    return { items: [{ id: "l1", title: "One short lesson", status: "Ready" }], progress: 0 };
  }
  if (KIND === "creator") {
    return {
      items: [
        { id: "c1", title: "Maya Chen — photo", status: "$1.2k / post" },
        { id: "c2", title: "North Studio — video", status: "$2.4k / film" },
      ],
      progress: 0,
    };
  }
  return {
    items: [
      { id: "i1", title: "Ready today", status: "Available now" },
      { id: "i2", title: "Next up", status: "This afternoon" },
    ],
    progress: 0,
  };
}

export function readMockState(): MockState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const initial = seed();
      window.localStorage.setItem(KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as MockState;
    if (!parsed || !Array.isArray(parsed.items)) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

function save(state: MockState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

export function listItems(): MockItem[] {
  return readMockState().items;
}

export function addRequest(pickup: string, dropoff: string) {
  const state = readMockState();
  state.items = [
    {
      id: uid(),
      title: pickup.trim() + " → " + dropoff.trim(),
      status: "Waiting for a rider",
      pickup: pickup.trim(),
      dropoff: dropoff.trim(),
    },
    ...state.items,
  ];
  save(state);
  return state;
}

export function acceptRequest(id?: string) {
  const state = readMockState();
  const item = id
    ? state.items.find((row) => row.id === id)
    : state.items.find((row) => /wait|ready/i.test(row.status));
  if (item) item.status = "Accepted";
  save(state);
  return state;
}

export function addBooking(name: string, when: string) {
  const state = readMockState();
  state.items = [
    { id: uid(), title: name.trim() || "Booking", status: "Booked", when: when.trim() },
    ...state.items,
  ];
  save(state);
  return state;
}

export function markReady(id?: string) {
  const state = readMockState();
  const item = id ? state.items.find((row) => row.id === id) : state.items[0];
  if (item) item.status = "Ready";
  save(state);
  return state;
}

export function startPractice() {
  const state = readMockState();
  state.progress = Math.min(100, (state.progress || 0) + 20);
  state.items = [
    { id: uid(), title: "Practice scored", status: String(state.progress) + "%" },
    ...state.items,
  ];
  save(state);
  return state;
}

export function addOutreach(company: string, budget: string) {
  const state = readMockState();
  state.items = [
    { id: uid(), title: company.trim() || "Brand", status: "Outreach · " + (budget.trim() || "budget open") },
    ...state.items,
  ];
  save(state);
  return state;
}

export function declineOffer(id?: string) {
  const state = readMockState();
  const item = id ? state.items.find((row) => row.id === id) : state.items[0];
  if (item) item.status = "Declined";
  save(state);
  return state;
}

export function addItem(title: string, status = "Open") {
  const state = readMockState();
  state.items = [{ id: uid(), title: title.trim() || "Item", status }, ...state.items];
  save(state);
  return state;
}
`;
}
