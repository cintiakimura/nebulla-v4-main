/**
 * Cloudflare DNS (zones + records) for Nebulla project custom domains.
 *
 * Env (reuse D1/R2 token when scopes allow):
 *   CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) — needs Zone:Read + DNS:Edit
 *   CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID) — optional filter when listing zones
 *   CLOUDFLARE_ZONE_ID — optional default zone shortcut
 */

import fs from "node:fs";
import path from "node:path";
import {
  resolveCloudflareAccountId,
  resolveCloudflareApiToken,
} from "./nebulaD1Provisioning";

const CF_API = "https://api.cloudflare.com/client/v4";

export type CfDnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV" | "CAA";

export type CfZone = {
  id: string;
  name: string;
  status?: string;
};

export type CfDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
  zoneId: string;
  zoneName?: string;
};

export type CfDnsStatus = {
  ready: boolean;
  missingEnv: string[];
  hint: string;
  defaultZoneId?: string;
};

type CfEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
  result_info?: { count?: number; page?: number; total_count?: number; total_pages?: number };
};

export function getCloudflareDnsStatus(): CfDnsStatus {
  const missing: string[] = [];
  if (!resolveCloudflareApiToken()) missing.push("CLOUDFLARE_API_TOKEN");
  const defaultZoneId = process.env.CLOUDFLARE_ZONE_ID?.trim() || undefined;
  const ready = missing.length === 0;
  return {
    ready,
    missingEnv: missing,
    defaultZoneId,
    hint: ready
      ? "Cloudflare DNS API is configured. Token needs Zone:Read and DNS:Edit on the target zone(s)."
      : `Set ${missing.join(", ")} on the Nebulla server. Token must include Zone:Read + DNS:Edit (in addition to D1/R2 scopes if shared).`,
  };
}

export function isCloudflareDnsConfigured(): boolean {
  return getCloudflareDnsStatus().ready;
}

async function cfFetch<T>(
  apiPath: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const token = resolveCloudflareApiToken();
  if (!token) return { ok: false, error: "CLOUDFLARE_API_TOKEN is not set" };

  const url = apiPath.startsWith("http") ? apiPath : `${CF_API}${apiPath}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Cloudflare request failed" };
  }

  let body: CfEnvelope<T> | null = null;
  try {
    body = (await res.json()) as CfEnvelope<T>;
  } catch {
    return { ok: false, error: `Cloudflare returned non-JSON (${res.status})`, status: res.status };
  }

  if (!res.ok || !body?.success) {
    const msg =
      body?.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      `Cloudflare API error (${res.status})`;
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: body.result as T };
}

/** Walk hostname parents until a Cloudflare zone matches. */
export async function resolveZoneForHostname(
  hostname: string,
): Promise<{ ok: true; zone: CfZone } | { ok: false; error: string }> {
  const host = normalizeHostname(hostname);
  if (!host) return { ok: false, error: "Domain is required" };

  const defaultZoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  if (defaultZoneId) {
    const z = await getZoneById(defaultZoneId);
    if (z.ok) {
      if (host === z.zone.name || host.endsWith(`.${z.zone.name}`)) {
        return { ok: true, zone: z.zone };
      }
    }
  }

  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    const found = await findZoneByName(candidate);
    if (found.ok) return found;
  }

  return {
    ok: false,
    error: `No Cloudflare zone found for "${host}". Add the domain to Cloudflare (or set CLOUDFLARE_ZONE_ID) and ensure the API token can read that zone.`,
  };
}

async function getZoneById(
  zoneId: string,
): Promise<{ ok: true; zone: CfZone } | { ok: false; error: string }> {
  const r = await cfFetch<{ id: string; name: string; status?: string }>(`/zones/${zoneId}`);
  if (r.ok === false) return { ok: false, error: r.error };
  return { ok: true, zone: { id: r.data.id, name: r.data.name, status: r.data.status } };
}

async function findZoneByName(
  name: string,
): Promise<{ ok: true; zone: CfZone } | { ok: false; error: string }> {
  const accountId = resolveCloudflareAccountId();
  const params = new URLSearchParams({ name, status: "active", page: "1", per_page: "5" });
  if (accountId) params.set("account.id", accountId);
  const r = await cfFetch<Array<{ id: string; name: string; status?: string }>>(
    `/zones?${params.toString()}`,
  );
  if (r.ok === false) return { ok: false, error: r.error };
  const match = (r.data || []).find((z) => z.name === name);
  if (!match) return { ok: false, error: `Zone not found: ${name}` };
  return { ok: true, zone: { id: match.id, name: match.name, status: match.status } };
}

export async function listDnsRecords(
  zoneId: string,
  options?: { name?: string; type?: string },
): Promise<{ ok: true; records: CfDnsRecord[] } | { ok: false; error: string }> {
  const params = new URLSearchParams({ page: "1", per_page: "100" });
  if (options?.name) params.set("name", options.name);
  if (options?.type) params.set("type", options.type);

  const all: CfDnsRecord[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 10) {
    params.set("page", String(page));
    const url = `${CF_API}/zones/${zoneId}/dns_records?${params.toString()}`;
    const token = resolveCloudflareApiToken();
    if (!token) return { ok: false, error: "CLOUDFLARE_API_TOKEN is not set" };

    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Cloudflare request failed" };
    }

    const body = (await res.json()) as CfEnvelope<
      Array<{
        id: string;
        type: string;
        name: string;
        content: string;
        ttl: number;
        proxied?: boolean;
        priority?: number;
        zone_id?: string;
        zone_name?: string;
      }>
    >;

    if (!res.ok || !body.success) {
      return {
        ok: false,
        error: body.errors?.map((e) => e.message).join("; ") || `List records failed (${res.status})`,
      };
    }

    for (const row of body.result || []) {
      all.push({
        id: row.id,
        type: row.type,
        name: row.name,
        content: row.content,
        ttl: row.ttl,
        proxied: row.proxied,
        priority: row.priority,
        zoneId: row.zone_id || zoneId,
        zoneName: row.zone_name,
      });
    }

    totalPages = body.result_info?.total_pages || 1;
    page += 1;
  }

  return { ok: true, records: all };
}

export async function createDnsRecord(params: {
  zoneId: string;
  type: string;
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}): Promise<{ ok: true; record: CfDnsRecord } | { ok: false; error: string }> {
  const type = params.type.toUpperCase();
  const body: Record<string, unknown> = {
    type,
    name: params.name.trim(),
    content: params.content.trim(),
    ttl: normalizeTtl(params.ttl),
  };
  if (type === "MX" || type === "SRV") {
    if (params.priority == null || Number.isNaN(Number(params.priority))) {
      return { ok: false, error: "priority is required for MX/SRV records" };
    }
    body.priority = Number(params.priority);
  }
  if (type === "A" || type === "AAAA" || type === "CNAME") {
    body.proxied = Boolean(params.proxied);
  }

  const r = await cfFetch<{
    id: string;
    type: string;
    name: string;
    content: string;
    ttl: number;
    proxied?: boolean;
    priority?: number;
    zone_id?: string;
    zone_name?: string;
  }>(`/zones/${params.zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (r.ok === false) return { ok: false, error: r.error };
  return {
    ok: true,
    record: {
      id: r.data.id,
      type: r.data.type,
      name: r.data.name,
      content: r.data.content,
      ttl: r.data.ttl,
      proxied: r.data.proxied,
      priority: r.data.priority,
      zoneId: r.data.zone_id || params.zoneId,
      zoneName: r.data.zone_name,
    },
  };
}

export async function updateDnsRecord(params: {
  zoneId: string;
  recordId: string;
  type: string;
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}): Promise<{ ok: true; record: CfDnsRecord } | { ok: false; error: string }> {
  const type = params.type.toUpperCase();
  const body: Record<string, unknown> = {
    type,
    name: params.name.trim(),
    content: params.content.trim(),
    ttl: normalizeTtl(params.ttl),
  };
  if (type === "MX" || type === "SRV") {
    body.priority = Number(params.priority ?? 10);
  }
  if (type === "A" || type === "AAAA" || type === "CNAME") {
    body.proxied = Boolean(params.proxied);
  }

  const r = await cfFetch<{
    id: string;
    type: string;
    name: string;
    content: string;
    ttl: number;
    proxied?: boolean;
    priority?: number;
    zone_id?: string;
    zone_name?: string;
  }>(`/zones/${params.zoneId}/dns_records/${params.recordId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (r.ok === false) return { ok: false, error: r.error };
  return {
    ok: true,
    record: {
      id: r.data.id,
      type: r.data.type,
      name: r.data.name,
      content: r.data.content,
      ttl: r.data.ttl,
      proxied: r.data.proxied,
      priority: r.data.priority,
      zoneId: r.data.zone_id || params.zoneId,
      zoneName: r.data.zone_name,
    },
  };
}

export async function deleteDnsRecord(
  zoneId: string,
  recordId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await cfFetch<unknown>(`/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
  });
  if (r.ok === false) return { ok: false, error: r.error };
  return { ok: true };
}

export type ProjectDnsPref = {
  domain: string;
  zoneId?: string;
  zoneName?: string;
  renderTargetHint?: string;
  updatedAt?: string;
};

export function readProjectDnsPref(workspaceRoot: string): ProjectDnsPref | null {
  const file = path.join(workspaceRoot, "nebula-dns.json");
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ProjectDnsPref;
    if (!parsed || typeof parsed.domain !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeProjectDnsPref(workspaceRoot: string, pref: ProjectDnsPref): void {
  const file = path.join(workspaceRoot, "nebula-dns.json");
  const payload: ProjectDnsPref = {
    ...pref,
    domain: normalizeHostname(pref.domain),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeHostname(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

function normalizeTtl(ttl?: number): number {
  const n = Number(ttl);
  if (!Number.isFinite(n) || n <= 0) return 1; // Cloudflare: 1 = automatic
  if (n === 1) return 1;
  return Math.min(Math.max(Math.floor(n), 60), 86400);
}
