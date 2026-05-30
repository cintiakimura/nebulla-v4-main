import fs from "fs";
import path from "path";

export type DesignReferenceEntry = {
  id: string;
  filename: string;
  url?: string;
  storageKey?: string;
  note?: string;
  uploadedAt: string;
};

const REL = path.join("nebulla-ide", "design-references.json");

function absPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, REL);
}

export function readDesignReferences(workspaceRoot: string): DesignReferenceEntry[] {
  const abs = absPath(workspaceRoot);
  if (!fs.existsSync(abs)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as { items?: unknown[] };
    if (!Array.isArray(raw.items)) return [];
    return raw.items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const filename = String(o.filename ?? "").trim();
        if (!filename) return null;
        return {
          id: String(o.id ?? filename).trim(),
          filename,
          url: typeof o.url === "string" ? o.url : undefined,
          storageKey: typeof o.storageKey === "string" ? o.storageKey : undefined,
          note: typeof o.note === "string" ? o.note : undefined,
          uploadedAt: typeof o.uploadedAt === "string" ? o.uploadedAt : new Date().toISOString(),
        } satisfies DesignReferenceEntry;
      })
      .filter(Boolean) as DesignReferenceEntry[];
  } catch {
    return [];
  }
}

export function writeDesignReferences(workspaceRoot: string, items: DesignReferenceEntry[]): void {
  const abs = absPath(workspaceRoot);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify({ items }, null, 2), "utf8");
}

export function addDesignReference(
  workspaceRoot: string,
  entry: Omit<DesignReferenceEntry, "id" | "uploadedAt"> & { id?: string },
): DesignReferenceEntry[] {
  const items = readDesignReferences(workspaceRoot);
  const next: DesignReferenceEntry = {
    id: entry.id?.trim() || `ref-${Date.now()}`,
    filename: entry.filename.trim(),
    url: entry.url?.trim() || undefined,
    storageKey: entry.storageKey?.trim() || undefined,
    note: entry.note?.trim() || undefined,
    uploadedAt: new Date().toISOString(),
  };
  writeDesignReferences(workspaceRoot, [...items.filter((i) => i.id !== next.id), next]);
  return readDesignReferences(workspaceRoot);
}

export function clearDesignReferences(workspaceRoot: string): void {
  const abs = absPath(workspaceRoot);
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

/** Short block for v0 prompt + Grok context (URLs only — no binary). */
export function summarizeDesignReferencesForPrompt(workspaceRoot: string, maxChars = 400): string {
  const items = readDesignReferences(workspaceRoot);
  if (items.length === 0) return "";
  const lines: string[] = [];
  for (const item of items.slice(0, 6)) {
    const parts = [item.filename];
    if (item.note) parts.push(item.note.slice(0, 80));
    if (item.url) parts.push(`URL: ${item.url}`);
    lines.push(`- ${parts.join(" — ")}`);
  }
  let text = lines.join("\n");
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return text;
}
