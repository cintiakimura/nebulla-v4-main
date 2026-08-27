/**
 * Server-side linked URL context — detect, allowlist, truncate, persist.
 * Run: npx tsx scripts/test-link-context-fetch.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LINKED_CONTEXT_MAX_CHARS,
  LINKED_CONTEXT_REL,
  buildLinkedContextAppendix,
  captureLinkedContextFromUserMessage,
  extractHttpUrls,
  extractReadableText,
  formatLinkedContextMissStatus,
  hostMatchesAllowlist,
  isBlockedHostname,
  isBlockedUrl,
  readLinkedContext,
  rewriteGithubBlobUrl,
  selectUrlsToFetch,
  truncateLinkedText,
  type LinkFetchImpl,
} from "../lib/linkContextFetch.ts";
import { grokStrokePolicy } from "../lib/grokRequestPolicy.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function mockFetch(body: string, opts?: { contentType?: string; url?: string; status?: number }): LinkFetchImpl {
  return async (input) => ({
    ok: (opts?.status ?? 200) < 400,
    status: opts?.status ?? 200,
    url: opts?.url || String(input),
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "content-type") return opts?.contentType || "text/markdown";
        return null;
      },
    },
    text: async () => body,
  });
}

section("URL-less message → no file write");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "link-ctx-"));
  const r = await captureLinkedContextFromUserMessage({
    workspaceRoot: tmp,
    userText: "Build a kids reading practice app",
    fetchImpl: mockFetch("SHOULD_NOT_RUN"),
  });
  assert.equal(r.skipped, true);
  assert.equal(r.wrote, false);
  assert.equal(r.status, "");
  assert.equal(fs.existsSync(path.join(tmp, LINKED_CONTEXT_REL)), false);
}

section("detect + prefer docs URLs");
{
  const urls = extractHttpUrls(
    "See https://example.com/home and https://github.com/acme/app/blob/main/README.md please.",
  );
  assert.equal(urls.length, 2);
  const picked = selectUrlsToFetch(urls);
  assert.equal(picked.length, 1);
  assert.match(picked[0], /github.com/);
  assert.equal(extractHttpUrls("no links here").length, 0);
  assert.equal(extractHttpUrls("javascript:alert(1)").length, 0);
}

section("github blob → raw rewrite");
{
  assert.equal(
    rewriteGithubBlobUrl("https://github.com/acme/app/blob/main/docs/guide.md"),
    "https://raw.githubusercontent.com/acme/app/main/docs/guide.md",
  );
}

section("blocked host / private IP → soft fail, no file");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "link-block-"));
  assert.equal(isBlockedHostname("localhost"), true);
  assert.equal(isBlockedHostname("127.0.0.1"), true);
  assert.equal(isBlockedHostname("192.168.1.9"), true);
  assert.equal(isBlockedUrl("https://127.0.0.1/secret"), true);
  assert.equal(hostMatchesAllowlist("evil.example"), false);
  const r = await captureLinkedContextFromUserMessage({
    workspaceRoot: tmp,
    userText: "Use https://evil.example/docs/method.md",
    fetchImpl: mockFetch("secret"),
  });
  assert.equal(r.wrote, false);
  assert.match(r.status, /host not on allowlist/i);
  assert.equal(fs.existsSync(path.join(tmp, LINKED_CONTEXT_REL)), false);
}

section("explicit prompt goal + blocked host → use prompt, do not scare");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "link-goal-"));
  const userText = [
    "FAST PROTOTYPE MODE. User goal / brief:",
    '"""',
    "Build a privacy-first learning companion for children with adaptive micro-learning.",
    "https://example.com/study/cognitive-load",
    '"""',
  ].join("\n");
  const r = await captureLinkedContextFromUserMessage({
    workspaceRoot: tmp,
    userText,
    fetchImpl: mockFetch("secret"),
  });
  assert.equal(r.wrote, false);
  assert.match(r.status, /Using your written goal/i);
  assert.equal(/continuing without it/i.test(r.status), false);
  assert.match(
    formatLinkedContextMissStatus(userText, ["host not allowed"]),
    /allowlist/i,
  );
}

section("truncation respects max length");
{
  const long = "A".repeat(LINKED_CONTEXT_MAX_CHARS + 500);
  const cut = truncateLinkedText(long);
  assert.ok(cut.length <= LINKED_CONTEXT_MAX_CHARS + 80);
  assert.match(cut, /truncated/i);
  const pretty = extractReadableText('{"ok":true,"n":1}', "application/json");
  assert.match(pretty, /"ok": true/);
}

section("allowlisted raw markdown → file contains snippet (mock fetch)");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "link-ok-"));
  const snippet = "Base44 methodology: one prompt, then iterate slices.";
  const r = await captureLinkedContextFromUserMessage({
    workspaceRoot: tmp,
    userText: "Follow https://raw.githubusercontent.com/acme/docs/main/README.md",
    fetchImpl: mockFetch(`# Guide\n\n${snippet}\n`, { contentType: "text/markdown" }),
  });
  assert.equal(r.wrote, true);
  assert.match(r.status, /Loaded context from/i);
  const md = readLinkedContext(tmp);
  assert.match(md, /Base44 methodology/);
  assert.match(md, /raw.githubusercontent.com/);
  const appendix = buildLinkedContextAppendix(md);
  assert.match(appendix, /LINKED DOCUMENT CONTEXT/);
  assert.match(appendix, /treat as reference, not user identity/);
  assert.match(appendix, /Base44 methodology/);
}

section("chat/plan tools stay empty; Go does not live-fetch");
{
  assert.deepEqual(grokStrokePolicy("chat").tools, []);
  assert.deepEqual(grokStrokePolicy("plan").tools, []);
  assert.deepEqual(grokStrokePolicy("go").tools, []);
  const goJob = fs.readFileSync(path.join(root, "lib/nebulaGoCodeJob.ts"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  const helper = fs.readFileSync(path.join(root, "lib/linkContextFetch.ts"), "utf8");
  assert.equal(/type:\s*["']web_search["']|type:\s*["']x_search["']/.test(helper), false);
  assert.equal(/captureLinkedContextFromUserMessage/.test(goJob), false);
  assert.match(server, /captureLinkedContextFromUserMessage/);
  const goPost = server.slice(server.indexOf('app.post("/api/grok/go-code"'));
  const goBody = goPost.slice(0, goPost.indexOf('app.post("/api/grok/go-code/poll"'));
  assert.equal(
    /captureLinkedContextFromUserMessage/.test(goBody),
    false,
    "Go must not live-fetch URLs",
  );
  assert.match(goBody, /readLinkedContext/);
}

console.log("\n✓ link context fetch passed\n");

function section(name: string) {
  console.log(`\n▸ ${name}`);
}
