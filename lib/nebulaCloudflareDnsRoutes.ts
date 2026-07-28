import type express from "express";
import {
  createDnsRecord,
  deleteDnsRecord,
  getCloudflareDnsStatus,
  listDnsRecords,
  readProjectDnsPref,
  resolveZoneForHostname,
  updateDnsRecord,
  writeProjectDnsPref,
} from "./nebulaCloudflareDns";

type ProjectPaths = {
  workspaceRoot: string;
  projectKey: string;
};

export function registerCloudflareDnsRoutes(
  app: express.Application,
  deps: {
    projectPathsFor: (req: express.Request) => ProjectPaths;
  },
): void {
  app.get("/api/dns/status", (_req, res) => {
    res.json({ ok: true, ...getCloudflareDnsStatus() });
  });

  app.get("/api/dns/preference", (req, res) => {
    try {
      const pp = deps.projectPathsFor(req);
      const pref = readProjectDnsPref(pp.workspaceRoot);
      return res.json({ ok: true, preference: pref });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Failed to read DNS preference",
      });
    }
  });

  app.put("/api/dns/preference", (req, res) => {
    try {
      const pp = deps.projectPathsFor(req);
      const domain = typeof req.body?.domain === "string" ? req.body.domain.trim() : "";
      if (!domain) return res.status(400).json({ ok: false, error: "domain is required" });
      const pref = {
        domain,
        zoneId: typeof req.body?.zoneId === "string" ? req.body.zoneId.trim() : undefined,
        zoneName: typeof req.body?.zoneName === "string" ? req.body.zoneName.trim() : undefined,
        renderTargetHint:
          typeof req.body?.renderTargetHint === "string"
            ? req.body.renderTargetHint.trim()
            : undefined,
      };
      writeProjectDnsPref(pp.workspaceRoot, pref);
      return res.json({ ok: true, preference: readProjectDnsPref(pp.workspaceRoot) });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Failed to save DNS preference",
      });
    }
  });

  app.get("/api/dns/zone", async (req, res) => {
    try {
      if (!getCloudflareDnsStatus().ready) {
        return res.status(503).json({ ok: false, error: getCloudflareDnsStatus().hint });
      }
      const domain =
        typeof req.query.domain === "string"
          ? req.query.domain
          : typeof req.query.name === "string"
            ? req.query.name
            : "";
      const resolved = await resolveZoneForHostname(domain);
      if (!resolved.ok) return res.status(404).json(resolved);
      return res.json({ ok: true, zone: resolved.zone });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Zone lookup failed",
      });
    }
  });

  app.get("/api/dns/records", async (req, res) => {
    try {
      if (!getCloudflareDnsStatus().ready) {
        return res.status(503).json({ ok: false, error: getCloudflareDnsStatus().hint });
      }

      let zoneId = typeof req.query.zoneId === "string" ? req.query.zoneId.trim() : "";
      const domain = typeof req.query.domain === "string" ? req.query.domain.trim() : "";

      if (!zoneId && domain) {
        const resolved = await resolveZoneForHostname(domain);
        if (!resolved.ok) return res.status(404).json(resolved);
        zoneId = resolved.zone.id;
      }
      if (!zoneId) {
        return res.status(400).json({ ok: false, error: "zoneId or domain is required" });
      }

      const listed = await listDnsRecords(zoneId, {
        name: typeof req.query.name === "string" ? req.query.name : undefined,
        type: typeof req.query.type === "string" ? req.query.type : undefined,
      });
      if (!listed.ok) return res.status(400).json(listed);
      return res.json({ ok: true, zoneId, records: listed.records });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Failed to list DNS records",
      });
    }
  });

  app.post("/api/dns/records", async (req, res) => {
    try {
      if (!getCloudflareDnsStatus().ready) {
        return res.status(503).json({ ok: false, error: getCloudflareDnsStatus().hint });
      }

      let zoneId = typeof req.body?.zoneId === "string" ? req.body.zoneId.trim() : "";
      const domain = typeof req.body?.domain === "string" ? req.body.domain.trim() : "";
      if (!zoneId && domain) {
        const resolved = await resolveZoneForHostname(domain);
        if (!resolved.ok) return res.status(404).json(resolved);
        zoneId = resolved.zone.id;
      }
      if (!zoneId) return res.status(400).json({ ok: false, error: "zoneId or domain is required" });

      const type = typeof req.body?.type === "string" ? req.body.type.trim() : "";
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const content =
        typeof req.body?.content === "string"
          ? req.body.content.trim()
          : typeof req.body?.value === "string"
            ? req.body.value.trim()
            : "";
      if (!type || !name || !content) {
        return res.status(400).json({ ok: false, error: "type, name, and content are required" });
      }

      const created = await createDnsRecord({
        zoneId,
        type,
        name,
        content,
        ttl: typeof req.body?.ttl === "number" ? req.body.ttl : Number(req.body?.ttl) || 1,
        priority:
          req.body?.priority === "" || req.body?.priority == null
            ? undefined
            : Number(req.body.priority),
        proxied: Boolean(req.body?.proxied),
      });
      if (!created.ok) return res.status(400).json(created);

      // Remember domain preference on the project workspace.
      try {
        const pp = deps.projectPathsFor(req);
        writeProjectDnsPref(pp.workspaceRoot, {
          domain: domain || name,
          zoneId,
          zoneName: created.record.zoneName,
          renderTargetHint:
            typeof req.body?.renderTargetHint === "string"
              ? req.body.renderTargetHint.trim()
              : undefined,
        });
      } catch {
        /* non-fatal */
      }

      return res.status(201).json({ ok: true, record: created.record });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Failed to create DNS record",
      });
    }
  });

  app.put("/api/dns/records/:recordId", async (req, res) => {
    try {
      if (!getCloudflareDnsStatus().ready) {
        return res.status(503).json({ ok: false, error: getCloudflareDnsStatus().hint });
      }
      const recordId = String(req.params.recordId || "").trim();
      const zoneId = typeof req.body?.zoneId === "string" ? req.body.zoneId.trim() : "";
      if (!recordId || !zoneId) {
        return res.status(400).json({ ok: false, error: "recordId and zoneId are required" });
      }
      const type = typeof req.body?.type === "string" ? req.body.type.trim() : "";
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const content =
        typeof req.body?.content === "string"
          ? req.body.content.trim()
          : typeof req.body?.value === "string"
            ? req.body.value.trim()
            : "";
      if (!type || !name || !content) {
        return res.status(400).json({ ok: false, error: "type, name, and content are required" });
      }

      const updated = await updateDnsRecord({
        zoneId,
        recordId,
        type,
        name,
        content,
        ttl: typeof req.body?.ttl === "number" ? req.body.ttl : Number(req.body?.ttl) || 1,
        priority:
          req.body?.priority === "" || req.body?.priority == null
            ? undefined
            : Number(req.body.priority),
        proxied: Boolean(req.body?.proxied),
      });
      if (!updated.ok) return res.status(400).json(updated);
      return res.json({ ok: true, record: updated.record });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Failed to update DNS record",
      });
    }
  });

  app.delete("/api/dns/records/:recordId", async (req, res) => {
    try {
      if (!getCloudflareDnsStatus().ready) {
        return res.status(503).json({ ok: false, error: getCloudflareDnsStatus().hint });
      }
      const recordId = String(req.params.recordId || "").trim();
      const zoneId =
        typeof req.query.zoneId === "string"
          ? req.query.zoneId.trim()
          : typeof req.body?.zoneId === "string"
            ? req.body.zoneId.trim()
            : "";
      if (!recordId || !zoneId) {
        return res.status(400).json({ ok: false, error: "recordId and zoneId are required" });
      }
      const deleted = await deleteDnsRecord(zoneId, recordId);
      if (!deleted.ok) return res.status(400).json(deleted);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Failed to delete DNS record",
      });
    }
  });

  /** Connect domain: resolve zone + persist preference + list records. */
  app.post("/api/dns/connect", async (req, res) => {
    try {
      if (!getCloudflareDnsStatus().ready) {
        return res.status(503).json({ ok: false, error: getCloudflareDnsStatus().hint });
      }
      const domain = typeof req.body?.domain === "string" ? req.body.domain.trim() : "";
      if (!domain) return res.status(400).json({ ok: false, error: "domain is required" });

      const resolved = await resolveZoneForHostname(domain);
      if (!resolved.ok) return res.status(404).json(resolved);

      const listed = await listDnsRecords(resolved.zone.id);
      if (!listed.ok) return res.status(400).json(listed);

      const pp = deps.projectPathsFor(req);
      writeProjectDnsPref(pp.workspaceRoot, {
        domain,
        zoneId: resolved.zone.id,
        zoneName: resolved.zone.name,
        renderTargetHint:
          typeof req.body?.renderTargetHint === "string"
            ? req.body.renderTargetHint.trim()
            : undefined,
      });

      return res.json({
        ok: true,
        zone: resolved.zone,
        records: listed.records,
        preference: readProjectDnsPref(pp.workspaceRoot),
      });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "Failed to connect domain",
      });
    }
  });
}
