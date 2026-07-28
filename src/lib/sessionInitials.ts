import type { NebulaSessionUser } from './nebulaCloud';

/** Two-letter badge for TopBar account circle. */
export function sessionInitials(user: NebulaSessionUser | null | undefined): string {
  if (!user) return 'NB';
  const name = user.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = (user.email || user.accountEmail || '').trim();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'NB';
}
