/**
 * Server proxy for xAI STT. Browser talks to /api/stt* only — Bearer stays here.
 */
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import {
  GROK_VOICE_TRANSCRIBE_MODEL,
  VOICE_ACL_HINT,
  XAI_STT_HTTP,
  buildSttKeyterms,
  buildStreamingSttUrl,
  isVoiceAclError,
  normalizeSttLanguage,
} from "./grokVoiceStt";

export type SttTicket = { apiKey: string; expiresAt: number };
const tickets = new Map<string, SttTicket>();
const TICKET_MS = 90_000;

export function mintSttTicket(apiKey: string): string {
  const ticket = `stt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  tickets.set(ticket, { apiKey, expiresAt: Date.now() + TICKET_MS });
  return ticket;
}

export function takeSttTicket(ticket: string): string {
  const row = tickets.get(ticket);
  if (!row) return "";
  if (row.expiresAt < Date.now()) {
    tickets.delete(ticket);
    return "";
  }
  return row.apiKey;
}

export type SttBatchOk = { ok: true; text: string; language?: string };
export type SttBatchFail = { ok: false; status: number; error: string; voiceAcl: boolean };
export type SttBatchResult = SttBatchOk | SttBatchFail;

export function isSttBatchFail(result: SttBatchResult): result is SttBatchFail {
  return result.ok === false;
}

export async function proxyBatchStt(opts: {
  apiKey: string;
  file: Buffer;
  filename?: string;
  mime?: string;
  language?: string;
  productName?: string;
  extraKeyterms?: string[];
}): Promise<SttBatchResult> {
  const language = normalizeSttLanguage(opts.language);
  const keyterms = buildSttKeyterms({ productName: opts.productName, extra: opts.extraKeyterms });
  const form = new FormData();
  form.append("model", GROK_VOICE_TRANSCRIBE_MODEL);
  form.append("format", "true");
  form.append("language", language);
  for (const term of keyterms) form.append("keyterm", term);
  const blob = new Blob([new Uint8Array(opts.file)], { type: opts.mime || "audio/webm" });
  form.append("file", blob, opts.filename || "clip.webm");

  const res = await fetch(XAI_STT_HTTP, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
  });
  const raw = await res.text();
  if (!res.ok) {
    const voiceAcl = isVoiceAclError(res.status, raw);
    return {
      ok: false,
      status: res.status,
      error: voiceAcl ? VOICE_ACL_HINT : raw.slice(0, 400) || `STT HTTP ${res.status}`,
      voiceAcl,
    };
  }
  let parsed: { text?: string; language?: string } = {};
  try {
    parsed = JSON.parse(raw) as { text?: string; language?: string };
  } catch {
    return { ok: false, status: 502, error: "STT returned non-JSON", voiceAcl: false };
  }
  return { ok: true, text: String(parsed.text || "").trim(), language: parsed.language };
}

export function attachGrokSttWebSocket(httpServer: Server, resolveApiKey: (req: IncomingMessage) => Promise<string>) {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    const pathOnly = url.split("?")[0] || "";
    if (pathOnly !== "/api/stt/stream") return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (client, req) => {
    void (async () => {
      const url = new URL(req.url || "", "http://127.0.0.1");
      const ticket = String(url.searchParams.get("ticket") || "").trim();
      let apiKey = takeSttTicket(ticket);
      if (!apiKey) {
        try {
          apiKey = await resolveApiKey(req);
        } catch {
          apiKey = "";
        }
      }
      if (!apiKey) {
        client.send(JSON.stringify({ type: "error", message: "No xAI key for STT. Use the same chat key — or type.", voiceAcl: false }));
        client.close();
        return;
      }
      const language = normalizeSttLanguage(url.searchParams.get("language"));
      const extra = url.searchParams.getAll("keyterm");
      const productName = url.searchParams.get("productName") || "";
      const keyterms = buildSttKeyterms({ productName, extra });
      const upstreamUrl = buildStreamingSttUrl({ language, keyterms, smartTurn: true });
      let upstream: WebSocket;
      try {
        upstream = new WebSocket(upstreamUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      } catch (err) {
        client.send(
          JSON.stringify({
            type: "error",
            message: err instanceof Error ? err.message : "STT stream failed",
            voiceAcl: false,
          }),
        );
        client.close();
        return;
      }

      let ready = false;
      const pending: Buffer[] = [];

      upstream.on("unexpected-response", (_req, res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const voiceAcl = isVoiceAclError(res.statusCode || 0, body);
          try {
            client.send(
              JSON.stringify({
                type: "error",
                message: voiceAcl ? VOICE_ACL_HINT : body.slice(0, 400) || `STT HTTP ${res.statusCode}`,
                voiceAcl,
                status: res.statusCode,
              }),
            );
          } catch {
            /* ignore */
          }
          client.close();
        });
      });

      upstream.on("open", () => {
        /* wait for transcript.created */
      });

      upstream.on("message", (data) => {
        const text = typeof data === "string" ? data : data.toString();
        try {
          const ev = JSON.parse(text) as { type?: string };
          if (ev.type === "transcript.created") {
            ready = true;
            for (const chunk of pending) {
              if (upstream.readyState === WebSocket.OPEN) upstream.send(chunk);
            }
            pending.length = 0;
          }
        } catch {
          /* forward raw */
        }
        if (client.readyState === WebSocket.OPEN) client.send(text);
      });

      upstream.on("close", () => {
        if (client.readyState === WebSocket.OPEN) client.close();
      });
      upstream.on("error", (err) => {
        try {
          client.send(
            JSON.stringify({
              type: "error",
              message: err instanceof Error ? err.message : "STT upstream error",
              voiceAcl: false,
            }),
          );
        } catch {
          /* ignore */
        }
        client.close();
      });

      client.on("message", (data, isBinary) => {
        if (upstream.readyState !== WebSocket.OPEN) return;
        if (isBinary || Buffer.isBuffer(data)) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          if (!ready) {
            pending.push(buf);
            return;
          }
          upstream.send(buf);
          return;
        }
        const raw = typeof data === "string" ? data : data.toString();
        try {
          const msg = JSON.parse(raw) as { type?: string };
          if (msg.type === "finalize" || msg.type === "Finalize") {
            upstream.send(JSON.stringify({ type: "finalize" }));
            return;
          }
          if (msg.type === "audio.done") {
            upstream.send(JSON.stringify({ type: "audio.done" }));
          }
        } catch {
          /* ignore */
        }
      });

      client.on("close", () => {
        try {
          if (upstream.readyState === WebSocket.OPEN) {
            upstream.send(JSON.stringify({ type: "audio.done" }));
            upstream.close();
          }
        } catch {
          /* ignore */
        }
      });
    })();
  });
}
