/**
 * Pure helpers for post-code UI refresh after Foundation/Go apply.
 * Kept free of DOM imports so smoke tests can import safely.
 *
 * Policy:
 * - First UI-relevant apply → regen Studio (post_code)
 * - Later applies of the *same* routes → reload live Preview only (mockup must not reclaim entry)
 * - New UI routes in a later slice (e.g. Primary after Foundation) → regen Studio again
 */

const UI_RELEVANT =
  /\.(tsx|jsx|vue|html|css)$|^(app|src|pages|components|public)\//i;

export function looksLikeUiRelevantPaths(writtenPaths: string[]): boolean {
  return writtenPaths.some((p) => UI_RELEVANT.test(p.replace(/\\/g, '/')));
}

/** Normalize path separators. */
export function normalizeUiPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Stable keys for UI routes / shells so Primary pages after Foundation
 * can trigger another Studio refresh without looping on identical re-applies.
 */
export function extractUiRouteKeys(writtenPaths: string[]): string[] {
  const keys = new Set<string>();
  for (const raw of writtenPaths) {
    const p = normalizeUiPath(raw);
    if (!UI_RELEVANT.test(p)) continue;
    // app/page.tsx → app ; app/kid/page.tsx → app/kid ; pages/Home.tsx → pages/Home
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

export type PostCodeUiAction = 'regen_post_code' | 'sync_preview_only' | 'skip_no_ui_paths';

function hasProductRoutePaths(writtenPaths: string[]): boolean {
  return writtenPaths.some((raw) => {
    const p = raw.replace(/\\/g, '/');
    return (
      /^app\/(?:.+\/)?page\.(tsx|jsx|js)$/i.test(p) ||
      /^(?:src\/)?pages\/.+\.(tsx|jsx|js)$/i.test(p)
    );
  });
}

export function resolvePostCodeUiAction(opts: {
  writtenPaths: string[];
  alreadyRanPostCode: boolean;
  /** Route keys covered by prior post-code Studio refresh this session. */
  previouslyCoveredKeys?: string[];
  force?: boolean;
}): PostCodeUiAction {
  if (!looksLikeUiRelevantPaths(opts.writtenPaths)) return 'skip_no_ui_paths';
  if (opts.force) return 'regen_post_code';
  // Product routes own App Preview — do not reopen UI Studio mockup after Go apply.
  if (hasProductRoutePaths(opts.writtenPaths)) return 'sync_preview_only';
  if (!opts.alreadyRanPostCode) return 'regen_post_code';
  if (hasNewUiRoutes(opts.writtenPaths, opts.previouslyCoveredKeys)) {
    return 'regen_post_code';
  }
  return 'sync_preview_only';
}
