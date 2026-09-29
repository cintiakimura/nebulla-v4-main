/**
 * Constitution gate. Every public entrypoint must call requireConstitution.
 * Locked: docs/architecture-decisions-2026-09-29.md §2 §9
 */
import crypto from "node:crypto";
import fs from "node:fs";
import type { AgentRoot } from "./paths.ts";
import { paths } from "./paths.ts";

export class ConstitutionHashMismatch extends Error {
  constructor(message = "constitution.md hash does not match constitution.sha256 — refuse") {
    super(message);
    this.name = "ConstitutionHashMismatch";
  }
}

export class ConstitutionConflict extends Error {
  constructor(public readonly flags: string[]) {
    super(`constitution conflict: ${flags.join("; ")}`);
    this.name = "ConstitutionConflict";
  }
}

export function sha256Bytes(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function hashConstitutionFile(root: AgentRoot): string {
  const p = paths(root);
  return sha256Bytes(fs.readFileSync(p.constitution));
}

export function writeConstitutionHash(root: AgentRoot): string {
  const p = paths(root);
  const hash = hashConstitutionFile(root);
  fs.writeFileSync(p.constitutionHash, `${hash}\n`, "utf8");
  return hash;
}

/** §2 — refuse to proceed if hash does not match. */
export function requireConstitution(root: AgentRoot): string {
  const p = paths(root);
  if (!fs.existsSync(p.constitution)) {
    throw new ConstitutionHashMismatch("constitution.md missing — refuse");
  }
  if (!fs.existsSync(p.constitutionHash)) {
    throw new ConstitutionHashMismatch("constitution.sha256 missing — refuse");
  }
  const actual = hashConstitutionFile(root);
  const expected = fs.readFileSync(p.constitutionHash, "utf8").trim().split(/\s+/)[0];
  if (!expected || actual !== expected) {
    throw new ConstitutionHashMismatch();
  }
  return fs.readFileSync(p.constitution, "utf8");
}

const FORBIDDEN_IN_PLAN = [
  /send (input )?directly to the executor/i,
  /stop mid-task/i,
  /skip (the )?lock/i,
  /in-place patch/i,
  /memory-only plan/i,
  /bypass constitution/i,
];

/** §4 / §9 — validate a draft against constitution.md; never silently resolve. */
export function validateAgainstConstitution(
  root: AgentRoot,
  draftText: string,
): { ok: true } | { ok: false; flags: string[] } {
  requireConstitution(root);
  const flags: string[] = [];
  for (const re of FORBIDDEN_IN_PLAN) {
    if (re.test(draftText)) flags.push(`conflicts with constitution: ${re.source}`);
  }
  if (flags.length) return { ok: false, flags };
  return { ok: true };
}
