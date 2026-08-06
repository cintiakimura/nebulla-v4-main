/**
 * Anti-amnesia loader for inference-first working files.
 * Injected into IDE Grok turns so Agent/coding continues from the draft.
 * Uses a batch API so missing files do not spam browser 404s on /api/files/open.
 */

import { fetchJson } from './apiFetch';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import { getInferenceFirstStage } from './uiMockupGate';

const MEMORY_PATHS = [
  'nebula-project/inference-first-rules.md',
  'nebula-project/fast-prototype-memory.md',
  'nebula-project/category-classification.md',
  'nebula-project/industry-standards.md',
  'nebula-project/competitor-research.md',
  'nebula-ui-studio/ui-brief.md',
] as const;

const PER_FILE_CHARS = 3500;
const TOTAL_CHARS = 14_000;

/**
 * Load inference-first law + project memory for the system prompt.
 * Missing files are listed so the model creates them (rules §1).
 */
export async function buildInferenceFirstMemoryAppendix(options?: {
  includeRulesExcerpt?: boolean;
}): Promise<string> {
  const includeRules = options?.includeRulesExcerpt !== false;
  const stage = getInferenceFirstStage();
  const parts: string[] = [
    'INFERENCE_FIRST_MEMORY (anti-amnesia — read before acting; do not restart Step 3.1 if a valid draft exists):',
    stage
      ? `Current product stage: ${stage} (research → plan_drafted → ui_mockup → coding → refine). Single API key: do not run parallel architecture+UI+codegen.`
      : 'Stages: research → plan_drafted → ui_mockup → coding → refine. UI mockup after ui-brief; coding after mockup triggered.',
  ];
  let used = 0;
  const missing: string[] = [];

  const paths = MEMORY_PATHS.filter(
    (p) => includeRules || !p.endsWith('inference-first-rules.md'),
  );

  let files: Record<string, string | null> = {};
  try {
    const res = await fetchJson<{ ok?: boolean; files?: Record<string, string | null> }>(
      withProjectQuery('/api/inference-first/memory'),
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withProjectBody({ paths: [...paths] })),
      },
    );
    if (res.files && typeof res.files === 'object') files = res.files;
  } catch {
    files = {};
  }

  for (const path of paths) {
    const body = (files[path] || '').trim();
    if (!body) {
      missing.push(path);
      continue;
    }
    const slice = body.slice(0, PER_FILE_CHARS);
    const block = `--- FILE ${path} ---\n${slice}${body.length > PER_FILE_CHARS ? '\n…(truncated)' : ''}`;
    if (used + block.length > TOTAL_CHARS) break;
    parts.push(block);
    used += block.length;
  }

  if (missing.length > 0) {
    parts.push(
      `MISSING (Create before continuing when the step requires them): ${missing.join(', ')}`,
    );
  }

  parts.push(
    'If Master Plan sections already exist in CURRENT MASTER PLAN above, continue from them — do not wipe or restart Guided Discovery.',
  );

  return parts.join('\n\n');
}
