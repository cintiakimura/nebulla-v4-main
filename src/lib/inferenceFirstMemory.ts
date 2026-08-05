/**
 * Anti-amnesia loader for inference-first working files.
 * Injected into IDE Grok turns so Agent/coding continues from the draft.
 */

import { openLocalFile } from './fileOperations';

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

async function readOptional(path: string): Promise<string | null> {
  try {
    const opened = await openLocalFile(path);
    if (opened.success === false || !opened.content?.trim()) return null;
    return opened.content.trim();
  } catch {
    return null;
  }
}

/**
 * Load inference-first law + project memory for the system prompt.
 * Missing files are listed so the model creates them (rules §1).
 */
export async function buildInferenceFirstMemoryAppendix(options?: {
  includeRulesExcerpt?: boolean;
}): Promise<string> {
  const includeRules = options?.includeRulesExcerpt !== false;
  const parts: string[] = [
    'INFERENCE_FIRST_MEMORY (anti-amnesia — read before acting; do not restart Step 3.1 if a valid draft exists):',
  ];
  let used = 0;
  const missing: string[] = [];

  for (const path of MEMORY_PATHS) {
    if (!includeRules && path.endsWith('inference-first-rules.md')) continue;
    const body = await readOptional(path);
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
