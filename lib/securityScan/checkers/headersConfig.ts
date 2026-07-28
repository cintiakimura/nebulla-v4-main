import fs from "node:fs";
import path from "node:path";
import type { SecurityFinding } from "../types";
import { withId } from "../findingId";
import { readFileTextLimited, type WalkedFile } from "../walkWorkspace";

/**
 * Advisory-only headers/config checks when auth/payments signals exist.
 * Severity capped at medium.
 */
export function scanHeadersConfig(
  workspaceRoot: string,
  files: WalkedFile[],
): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  let hasAuthOrPayments = false;

  for (const file of files.slice(0, 80)) {
    const text = readFileTextLimited(file.absPath, 64 * 1024);
    if (!text) continue;
    if (
      /\b(stripe|paypal|checkout|requireAuth|getServerSession|next-auth|clerk|password|login)\b/i.test(
        text,
      )
    ) {
      hasAuthOrPayments = true;
      break;
    }
  }

  if (!hasAuthOrPayments) return out;

  const nextConfig = ["next.config.js", "next.config.mjs", "next.config.ts"].find((f) =>
    fs.existsSync(path.join(workspaceRoot, f)),
  );
  const hasHelmet =
    files.some((f) => /helmet/i.test(f.relPath)) ||
    files.some((f) => {
      const t = readFileTextLimited(f.absPath, 32 * 1024);
      return t ? /\bhelmet\s*\(/.test(t) || /content-security-policy/i.test(t) : false;
    });

  if (nextConfig && !hasHelmet) {
    const cfgText = readFileTextLimited(path.join(workspaceRoot, nextConfig), 64 * 1024) || "";
    if (!/contentSecurityPolicy|headers\s*\(/i.test(cfgText)) {
      out.push(
        withId({
          rule: "headers.next_missing",
          path: nextConfig,
          severity: "medium",
          category: "headers",
          title: "Security headers not obviously configured",
          description:
            "This project looks like it has auth or payments, but no Content-Security-Policy / security headers configuration was found in Next config.",
          recommendation:
            "Add security headers (CSP, X-Frame-Options / frame-ancestors, etc.) in next.config or your reverse proxy before publishing login/payment flows.",
          fixKind: "open-file",
          confidence: "low",
        }),
      );
    }
  }

  return out;
}
