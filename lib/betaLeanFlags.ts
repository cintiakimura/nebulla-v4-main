/**
 * Closed-beta lean cut: freeze dead/optional surface so the critical path stays clear.
 * Override with ENABLE_LEGACY_V0=true / ENABLE_PENCIL=true only for emergency revive.
 */

function envTruthy(name: string): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Legacy V0 Studio API routes — frozen for closed beta (UI Studio Beta only). */
export function isLegacyV0ApiFrozen(): boolean {
  if (envTruthy("ENABLE_LEGACY_V0")) return false;
  return true;
}

/** Pencil.dev mockup live API — frozen; bundled demo SVG may still serve. */
export function isPencilApiFrozen(): boolean {
  if (envTruthy("ENABLE_PENCIL")) return false;
  return true;
}

export const LEGACY_V0_FROZEN_MESSAGE =
  "Legacy V0 generation is frozen for closed beta. Use UI Studio Beta → Generate UI.";

export const PENCIL_FROZEN_MESSAGE =
  "Pencil live mockups are frozen for closed beta. Use UI Studio Beta, or bundled demo SVG only.";
