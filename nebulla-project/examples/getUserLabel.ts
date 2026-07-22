/**
 * Demo: common React/TS runtime bug — reading a property before checking the object.
 * Fixed with the Guardian process (checklist → bug DB → NDM).
 */

export type User = { name: string } | null | undefined;

/**
 * Safe label for UI. Missing user → friendly fallback.
 */
export function getUserLabel(user: User): string {
  if (!user || typeof user.name !== "string" || !user.name.trim()) {
    return "Guest";
  }
  return user.name.trim();
}
