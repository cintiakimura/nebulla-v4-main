/**
 * Human-readable UI Gen v2 status labels for Beta toolbar / banners.
 */

export function figmaStatusLabel(status: string): string {
  switch (status) {
    case 'offline':
      return 'Offline library';
    case 'success':
      return 'Figma: live matched';
    case 'weak_matches':
      return 'Patterns: seed fallback';
    case 'missing_key':
      return 'Patterns: catalog + brief';
    case 'unauthorized':
      return 'Patterns: seed fallback (Figma auth)';
    case 'rate_limited':
      return 'Patterns: seed fallback (Figma busy)';
    case 'failed':
      return 'Patterns: seed fallback (Figma skip)';
    case 'skipped':
      return 'Patterns: catalog + brief';
    default:
      return status ? `Figma: ${status}` : '';
  }
}

/** Soft statuses — seed/catalog fallback already applied; do not paint as hard failure. */
export function figmaStatusIsSoftFallback(status: string): boolean {
  return (
    status === 'rate_limited' ||
    status === 'weak_matches' ||
    status === 'missing_key' ||
    status === 'failed' ||
    status === 'skipped' ||
    status === 'unauthorized'
  );
}

export function patternModeLabel(mode: string): string {
  if (mode === 'seed') return 'Built-in patterns (seed fallback)';
  if (mode === 'figma') return 'Offline / Figma library';
  return '';
}

export function gateLabel(gate: string): string {
  switch (gate) {
    case 'pass':
      return 'Gate: pass';
    case 'repair':
      return 'Gate: repair';
    case 'weak':
      return 'Gate: weak';
    default:
      return gate ? `Gate: ${gate}` : '';
  }
}

export function weakGateUserMessage(): string {
  return 'Preview not updated — improve brief/tokens or retry Generate UI.';
}
