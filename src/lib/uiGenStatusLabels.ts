/**
 * Human-readable UI Gen v2 status labels for Beta toolbar / banners.
 */

export function figmaStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return 'Figma: matched';
    case 'weak_matches':
      return 'Patterns: built-in (Figma weak)';
    case 'missing_key':
      return 'Patterns: built-in';
    case 'unauthorized':
      return 'Patterns: built-in (Figma auth)';
    case 'rate_limited':
      return 'Patterns: built-in (Figma busy)';
    case 'failed':
      return 'Patterns: built-in (Figma skip)';
    case 'skipped':
      return 'Patterns: built-in';
    default:
      return status ? `Figma: ${status}` : '';
  }
}

/** Soft statuses — seed fallback already applied; do not paint as hard failure. */
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
  if (mode === 'seed') return 'Built-in patterns (Figma not used)';
  if (mode === 'figma') return 'Figma references';
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
