import type { SecurityFinding } from "../types";
import { withId } from "../findingId";
import { redactSecretsInText, redactToken } from "../redact";
import {
  isAllowlistedPath,
  isClientShippedPath,
  isEnvExampleName,
  isEnvFileName,
  looksLikePlaceholder,
} from "../allowlists";
import { readFileTextLimited, type WalkedFile } from "../walkWorkspace";

type PatternRule = {
  rule: string;
  name: string;
  re: RegExp;
  /** When true, match alone is enough for high confidence. */
  highConfidence: boolean;
};

const PATTERNS: PatternRule[] = [
  { rule: "cred.openai_sk", name: "OpenAI-style API key", re: /\bsk-[a-zA-Z0-9]{20,}\b/g, highConfidence: true },
  { rule: "cred.xai", name: "xAI / Grok API key", re: /\bxai-[a-zA-Z0-9_]{20,}\b/g, highConfidence: true },
  { rule: "cred.ghp", name: "GitHub personal access token", re: /\bghp_[a-zA-Z0-9]{20,}\b/g, highConfidence: true },
  {
    rule: "cred.github_pat",
    name: "GitHub fine-grained PAT",
    re: /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
    highConfidence: true,
  },
  { rule: "cred.akia", name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g, highConfidence: true },
  {
    rule: "cred.stripe_secret",
    name: "Stripe secret key",
    re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    highConfidence: true,
  },
  {
    rule: "cred.slack",
    name: "Slack token",
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    highConfidence: true,
  },
  {
    rule: "cred.bearer",
    name: "Bearer token literal",
    re: /\bBearer\s+([A-Za-z0-9_\-./+=]{32,})\b/gi,
    highConfidence: false,
  },
];

const PEM_RE = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g;
const CONN_RE =
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:@\s\/]+:[^@\s\/]+@[^\s'"]+/gi;
const VITE_SECRET_ASSIGN =
  /\b((?:VITE_|NEXT_PUBLIC_)[A-Z0-9_]*(?:SECRET|PRIVATE|API_KEY|TOKEN|PASSWORD)[A-Z0-9_]*)\s*=\s*["']([^"']{12,})["']/g;
const HARDCODED_PASSWORD =
  /\b(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{8,})["']/gi;

export function scanCredentials(files: WalkedFile[]): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const softAllow = isAllowlistedPath(file.relPath);
    const envExample = isEnvExampleName(file.base);
    const envLive = isEnvFileName(file.base) && !envExample;
    const clientPath = isClientShippedPath(file.relPath);

    if (envLive) {
      const f = withId({
        rule: "cred.env_present",
        path: file.relPath,
        severity: "high",
        category: "credentials",
        title: "Environment file present in project workspace",
        description:
          "A live .env file is in the project tree. If this is committed or synced to a public deploy, secrets can leak.",
        recommendation:
          "Keep secrets in Nebulla Secrets / host env vars. Add .env to .gitignore and never commit real keys. Use .env.example with placeholders only.",
        fixKind: "open-secrets",
        confidence: "high",
        fingerprint: file.base,
      });
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }

    const text = readFileTextLimited(file.absPath);
    if (text == null) continue;

    if (PEM_RE.test(text)) {
      PEM_RE.lastIndex = 0;
      if (!softAllow || !envExample) {
        const f = withId({
          rule: "cred.private_key",
          path: file.relPath,
          line: lineOfMatch(text, text.search(/-----BEGIN/)),
          severity: clientPath || envLive ? "critical" : "high",
          category: "credentials",
          title: "Private key material detected",
          description: "A PEM private key block was found in source or config. Private keys must never ship with an app.",
          evidence: "[REDACTED PRIVATE KEY]",
          recommendation: "Remove the key from the repo. Store it in a secrets manager or host environment, rotate the key, and add the path to .gitignore.",
          fixKind: clientPath ? "open-file" : "open-secrets",
          confidence: "high",
        });
        if (!seen.has(f.id)) {
          seen.add(f.id);
          out.push(f);
        }
      }
    }

    for (const rule of PATTERNS) {
      rule.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.re.exec(text)) != null) {
        const raw = m[1] || m[0];
        if (looksLikePlaceholder(raw)) continue;
        if (softAllow || envExample) {
          // Docs / examples: info only
          const f = withId({
            rule: `${rule.rule}.example`,
            path: file.relPath,
            line: lineOfMatch(text, m.index),
            severity: "info",
            category: "credentials",
            title: `${rule.name} pattern in docs/example`,
            description: "Looks like a secret pattern in an example or documentation file. Confirm it is a placeholder, not a real key.",
            evidence: redactToken(raw),
            recommendation: "Keep only placeholders in example files. If this is a real key, revoke it and move it to Secrets.",
            fixKind: "manual",
            confidence: "low",
            fingerprint: redactToken(raw),
          });
          if (!seen.has(f.id)) {
            seen.add(f.id);
            out.push(f);
          }
          continue;
        }

        const severity =
          clientPath || envLive ? "critical" : rule.highConfidence ? "high" : "medium";
        const f = withId({
          rule: rule.rule,
          path: file.relPath,
          line: lineOfMatch(text, m.index),
          severity,
          category: "credentials",
          title: `${rule.name} found in project files`,
          description: clientPath
            ? "This looks like a live credential in a client-shipped path. Anyone who loads your app could extract it."
            : "This looks like a live credential in the project workspace. It may be committed or deployed by mistake.",
          evidence: redactSecretsInText(raw),
          recommendation:
            "Revoke/rotate the key immediately. Store it in Nebulla Secrets or your host environment. Remove it from source and ensure .gitignore covers .env files.",
          fixKind: "open-secrets",
          confidence: rule.highConfidence ? "high" : "medium",
          fingerprint: redactToken(raw),
        });
        if (!seen.has(f.id)) {
          seen.add(f.id);
          out.push(f);
        }
      }
    }

    CONN_RE.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = CONN_RE.exec(text)) != null) {
      if (looksLikePlaceholder(cm[0])) continue;
      if (softAllow || envExample) continue;
      const f = withId({
        rule: "cred.connection_string",
        path: file.relPath,
        line: lineOfMatch(text, cm.index),
        severity: clientPath ? "critical" : "high",
        category: "credentials",
        title: "Database connection string with embedded password",
        description: "A connection URL containing credentials was found in source. These often leak via git history or client bundles.",
        evidence: redactSecretsInText(cm[0]),
        recommendation: "Move the connection string to server-only environment variables. Never embed passwords in client code.",
        fixKind: "open-secrets",
        confidence: "high",
        fingerprint: redactSecretsInText(cm[0], 40),
      });
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }

    VITE_SECRET_ASSIGN.lastIndex = 0;
    let vm: RegExpExecArray | null;
    while ((vm = VITE_SECRET_ASSIGN.exec(text)) != null) {
      const val = vm[2] || "";
      if (looksLikePlaceholder(val)) continue;
      if (/^pk_(?:live|test)_/i.test(val)) continue; // Stripe publishable
      if (softAllow || envExample) continue;
      const f = withId({
        rule: "cred.public_env_secret",
        path: file.relPath,
        line: lineOfMatch(text, vm.index),
        severity: "critical",
        category: "credentials",
        title: "Secret-like value in public env variable",
        description: `${vm[1]} is exposed to the browser (VITE_/NEXT_PUBLIC_). Secret keys must not use public prefixes.`,
        evidence: `${vm[1]}=${redactToken(val)}`,
        recommendation:
          "Use a server-only env var (no VITE_/NEXT_PUBLIC_ prefix) and call APIs from your backend. Put publishable keys only when they are meant to be public (e.g. Stripe pk_).",
        fixKind: "open-file",
        confidence: "high",
        fingerprint: vm[1],
      });
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }

    HARDCODED_PASSWORD.lastIndex = 0;
    let pm: RegExpExecArray | null;
    while ((pm = HARDCODED_PASSWORD.exec(text)) != null) {
      const val = pm[1] || "";
      if (looksLikePlaceholder(val)) continue;
      if (softAllow || envExample) continue;
      const f = withId({
        rule: "cred.hardcoded_password",
        path: file.relPath,
        line: lineOfMatch(text, pm.index),
        severity: clientPath ? "high" : "medium",
        category: "credentials",
        title: "Hardcoded password assignment",
        description: "A password-like literal was found in source. Prefer secrets managers and hashed credentials.",
        evidence: redactSecretsInText(pm[0]),
        recommendation: "Remove the hardcoded password. Use environment variables or a secrets store, and rotate the credential.",
        fixKind: "open-file",
        confidence: "medium",
        fingerprint: redactToken(val),
      });
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }
  }

  return out;
}

function lineOfMatch(text: string, index: number): number | undefined {
  if (index < 0) return undefined;
  return text.slice(0, index).split(/\r?\n/).length;
}
