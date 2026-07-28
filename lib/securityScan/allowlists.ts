/** False-positive controls for Security Scan. */

const PLACEHOLDER_RE =
  /\b(YOUR[_-]?API[_-]?KEY|YOUR[_-]?SECRET|CHANGEME|CHANGE[_-]?ME|XXXX+|TODO[_-]?KEY|REPLACE[_-]?ME|EXAMPLE[_-]?KEY|INSERT[_-]?KEY|<.*>|\$\{?[A-Z0-9_]+\}?)\b/i;

const ALLOW_PATH_SUBSTR = [
  "bugDatabaseSnippet",
  "previewRuntimeBridgeScript",
  "nebulla-project/",
  "nebula-project/",
  "node_modules/",
  ".git/",
];

const ALLOW_PATH_SUFFIX = [".example", ".sample", ".template", ".md"];

const ENV_EXAMPLE_NAMES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.example.local",
]);

export function isAllowlistedPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/");
  const base = p.split("/").pop() || p;
  if (ENV_EXAMPLE_NAMES.has(base)) return true;
  if (ALLOW_PATH_SUFFIX.some((s) => base.endsWith(s) && base !== ".env")) {
    // *.md and *.example are soft-allow for credential noise; still scanned for PEM etc. via checker
    if (base.endsWith(".md") || base.includes(".example") || base.includes(".sample")) return true;
  }
  if (ALLOW_PATH_SUBSTR.some((s) => p.includes(s))) return true;
  return false;
}

export function looksLikePlaceholder(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (PLACEHOLDER_RE.test(v)) return true;
  if (/^x{6,}$/i.test(v)) return true;
  if (/^(test|demo|dummy|fake|sample)[-_]?key/i.test(v)) return true;
  // Short obvious stubs
  if (v.length < 16 && /^(key|secret|token|password)$/i.test(v)) return true;
  return false;
}

/** Client-shipped path heuristics (Vite/Next public surfaces). */
export function isClientShippedPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/").toLowerCase();
  if (p.startsWith("public/")) return true;
  if (/(^|\/)(src|app|components|pages|client)\//.test(p)) return true;
  if (/\.(tsx|jsx|vue|svelte)$/.test(p) && !/(^|\/)(server|api)\//.test(p)) return true;
  return false;
}

export function isEnvFileName(base: string): boolean {
  return (
    base === ".env" ||
    base === ".env.local" ||
    base === ".env.production" ||
    base === ".env.development" ||
    /^\.env\.[a-z0-9_.-]+$/i.test(base)
  );
}

export function isEnvExampleName(base: string): boolean {
  return ENV_EXAMPLE_NAMES.has(base) || /\.env\.(example|sample|template)/i.test(base);
}
