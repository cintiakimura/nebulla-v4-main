import { createHash } from "node:crypto";
import type { SecurityFinding } from "./types";

/** Stable id so dismissals survive re-scans when the issue is unchanged. */
export function makeFindingId(parts: {
  rule: string;
  path?: string;
  line?: number;
  fingerprint?: string;
}): string {
  const raw = [
    parts.rule,
    (parts.path || "").replace(/\\/g, "/"),
    parts.line != null ? String(parts.line) : "",
    parts.fingerprint || "",
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function withId(
  finding: Omit<SecurityFinding, "id"> & { rule: string; fingerprint?: string },
): SecurityFinding {
  const { rule, fingerprint, ...rest } = finding;
  return {
    ...rest,
    id: makeFindingId({
      rule,
      path: rest.path,
      line: rest.line,
      fingerprint,
    }),
  };
}
