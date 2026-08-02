/**
 * Human-readable UI Gen v2 status labels for Beta toolbar / banners.
 */

export function figmaStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return 'Figma: matched';
    case 'weak_matches':
      return 'Figma: weak match';
    case 'missing_key':
      return 'Figma: not configured';
    case 'unauthorized':
      return 'Figma: unauthorized';
    case 'rate_limited':
      return 'Figma: rate limited';
    case 'failed':
      return 'Figma: failed';
    case 'skipped':
      return 'Figma: skipped';
    default:
      return status ? `Figma: ${status}` : '';
  }
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
