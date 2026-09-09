/**
 * Human-readable UI Gen v2 status labels for Beta toolbar / banners.
 */

export function figmaStatusLabel(status: string): string {
  switch (status) {
    case 'offline':
      return 'Layout draft';
    case 'success':
      return 'Layout references matched';
    case 'weak_matches':
      return 'Patterns: seed fallback';
    case 'missing_key':
      return 'Patterns: layout draft + brief';
    case 'unauthorized':
      return 'Patterns: seed fallback';
    case 'rate_limited':
      return 'Patterns: seed fallback';
    case 'failed':
      return 'Patterns: seed fallback';
    case 'skipped':
      return 'Patterns: layout draft / brief';
    default:
      return status ? `Layout: ${status}` : '';
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
  if (mode === 'figma') return 'Layout draft';
  if (mode === 'catalog') return 'Layout draft';
  return '';
}

/** Chat / activity line — never claim Figma if seed ran; never claim live if offline. */
export function figmaPickActivityLine(input: {
  figma_status?: string;
  figma_used?: string;
  selection_mode?: string;
  file_key?: string | null;
  sheet_category?: string | null;
  preferred_bucket?: string | null;
  pattern_mode?: string;
  ui_pass?: 'precode' | 'final' | string;
}): string {
  const head = input.ui_pass === 'final' ? 'Final UI — restyle after coding' : 'Pre-code mockup';
  const status = input.figma_status || 'none';
  const miss =
    status === 'weak_matches' ||
    ((input.figma_used === 'no' || !input.figma_used) &&
      status !== 'offline' &&
      status !== 'success' &&
      status !== 'skipped');
  if (miss && status !== 'skipped') {
    return `${head} — seed miss`;
  }
  return `${head} — layout draft`;
}

/** Prefer selection_mode when present for precise operator copy. */
export function referenceDriveLabel(selectionMode: string, figmaStatus: string): string {
  const m = selectionMode || '';
  if (m.startsWith('offline:') || figmaStatus === 'offline') return 'Layout draft hit';
  if (m.startsWith('live:') || figmaStatus === 'success') return 'Layout references hit';
  if (m.startsWith('catalog:') || m.includes(':catalog:')) return 'Layout draft hit';
  if (m.includes(':brief:')) return 'Brief-only guidance';
  if (m.includes(':seed:') || figmaStatus === 'weak_matches') return 'Seed fallback';
  return figmaStatusLabel(figmaStatus);
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
  return 'Preview not updated — layout below Stitch-minimum. Retry Generate UI (repair rebinds slots).';
}
