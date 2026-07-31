/**
 * Browser → POST /api/contract-telemetry (privacy-safe counts only).
 */
import { withProjectQuery } from './nebulaProjectApi';

export function postContractTelemetry(body: Record<string, unknown>): void {
  try {
    void fetch(withProjectQuery('/api/contract-telemetry'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      /* ignore */
    });
  } catch {
    /* ignore */
  }
}

export function reportGoApplyTelemetry(opts: {
  writtenPaths: string[];
  sliceLabel?: string;
}): void {
  const APP_PREFIXES = ['app/', 'components/', 'src/', 'pages/'];
  const paths = opts.writtenPaths || [];
  const hasApp = paths.some((p) => APP_PREFIXES.some((pre) => p.startsWith(pre)));
  postContractTelemetry({
    event: 'go_apply_result',
    applyKind: paths.length === 0 ? 'unknown' : hasApp ? 'hasAppFiles' : 'planOnly',
    writtenCount: paths.length,
    sliceLabel: opts.sliceLabel,
  });
}

export function reportAppStatusFixOutcome(opts: {
  outcome: 'reachedGreen' | 'stillRed' | 'unknown';
  reloadCycles?: number;
}): void {
  postContractTelemetry({
    event: 'app_status_fix_outcome',
    outcome: opts.outcome,
    reloadCycles: opts.reloadCycles ?? 0,
  });
}
