/**
 * Post-code Final UI trigger (offline catalog restyle after product files exist).
 * Mockup must not reclaim App Preview. Live Figma stays ingest-only.
 */

export const MAX_FINAL_UI_AUTOPILOT_RUNS = 2;

const METHODOLOGY =
  /^(nebula-project|nebulla-project|nebula-project)\//i;

const PRODUCT_UI =
  /^(app|src|pages|components)\//i;

const UI_RELEVANT =
  /\.(tsx|jsx|vue|html|css)$|^(app|src|pages|components|public)\//i;

export function looksLikeUiRelevantPaths(writtenPaths: string[]): boolean {
  return writtenPaths.some((p) => UI_RELEVANT.test(p.replace(/\\/g, '/')));
}

export function normalizeUiPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isMethodologyPath(p: string): boolean {
  return METHODOLOGY.test(normalizeUiPath(p));
}

/** Product UI source — not mockup HTML, not methodology docs. */
export function looksLikeProductAppFiles(writtenPaths: string[]): boolean {
  return writtenPaths.some((raw) => {
    const p = normalizeUiPath(raw);
    if (isMethodologyPath(p)) return false;
    if (/\.(md|json)$/i.test(p)) return false;
    return PRODUCT_UI.test(p) && /\.(tsx|jsx|js|css)$/i.test(p);
  });
}

export function extractUiRouteKeys(writtenPaths: string[]): string[] {
  const keys = new Set<string>();
  for (const raw of writtenPaths) {
    const p = normalizeUiPath(raw);
    if (!UI_RELEVANT.test(p) || isMethodologyPath(p)) continue;
    if (/^app\/page\.(tsx|jsx|js)$/i.test(p)) {
      keys.add('app');
      continue;
    }
    const pageMatch =
      p.match(/^(app\/.+?)\/page\.(tsx|jsx|js)$/i) ||
      p.match(/^(pages\/.+?)\.(tsx|jsx|js)$/i) ||
      p.match(/^(src\/pages\/.+?)\.(tsx|jsx|js)$/i);
    if (pageMatch) {
      keys.add(pageMatch[1].toLowerCase());
      continue;
    }
    if (/^(app|src)\/layout\.(tsx|jsx)$/i.test(p) || /^index\.html$/i.test(p)) {
      keys.add(p.toLowerCase());
      continue;
    }
    if (/\.(tsx|jsx|css|html)$/i.test(p)) {
      keys.add(p.toLowerCase());
    }
  }
  return [...keys].sort();
}

export function hasNewUiRoutes(
  writtenPaths: string[],
  previouslyCoveredKeys: string[] | undefined,
): boolean {
  const incoming = extractUiRouteKeys(writtenPaths);
  if (!incoming.length) return false;
  if (!previouslyCoveredKeys?.length) return true;
  const prev = new Set(previouslyCoveredKeys.map((k) => k.toLowerCase()));
  return incoming.some((k) => !prev.has(k));
}

export function isLastAutopilotSlice(sliceLabel?: string | null): boolean {
  return /polish/i.test(String(sliceLabel || ''));
}

export type PostCodeUiAction =
  | 'run_final_ui'
  | 'regen_post_code'
  | 'sync_preview_only'
  | 'skip_no_ui_paths';

/**
 * Final UI: once after first Foundation product apply, once after last autopilot (Polish).
 * Max two autopilot runs. Mockup-only / methodology → skip.
 */
export function resolvePostCodeUiAction(opts: {
  writtenPaths: string[];
  alreadyRanPostCode: boolean;
  previouslyCoveredKeys?: string[];
  force?: boolean;
  /** Successful Final UI runs this project (cycle JSON). */
  finalUiCount?: number;
  sliceLabel?: string | null;
}): PostCodeUiAction {
  if (!looksLikeProductAppFiles(opts.writtenPaths)) return 'skip_no_ui_paths';
  if (opts.force) return 'run_final_ui';
  const count =
    typeof opts.finalUiCount === 'number'
      ? opts.finalUiCount
      : opts.alreadyRanPostCode
        ? 1
        : 0;
  if (count >= MAX_FINAL_UI_AUTOPILOT_RUNS) return 'sync_preview_only';
  if (count === 0) return 'run_final_ui';
  if (count === 1 && isLastAutopilotSlice(opts.sliceLabel)) return 'run_final_ui';
  return 'sync_preview_only';
}
