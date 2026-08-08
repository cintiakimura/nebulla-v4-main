/**
 * Pure helpers for one-shot post-code UI refresh after Foundation/Go apply.
 * Kept free of DOM imports so smoke tests can import safely.
 */

const UI_RELEVANT =
  /\.(tsx|jsx|vue|html|css)$|^(app|src|pages|components|public)\//i;

export function looksLikeUiRelevantPaths(writtenPaths: string[]): boolean {
  return writtenPaths.some((p) => UI_RELEVANT.test(p.replace(/\\/g, '/')));
}

export type PostCodeUiAction = 'regen_post_code' | 'sync_preview_only' | 'skip_no_ui_paths';

export function resolvePostCodeUiAction(opts: {
  writtenPaths: string[];
  alreadyRanPostCode: boolean;
  force?: boolean;
}): PostCodeUiAction {
  if (!looksLikeUiRelevantPaths(opts.writtenPaths)) return 'skip_no_ui_paths';
  if (opts.alreadyRanPostCode && !opts.force) return 'sync_preview_only';
  return 'regen_post_code';
}
