/**
 * Spine sequence gates — nebula-project/recovery-orchestration.md §11.
 * Client-safe helpers: ./spineSequenceClient (no fs). uiBriefUsable is server-only.
 */

import { parsePagesFromUiBrief } from "./nebulaUiBrief";
import { uiBriefTooShort } from "./spineSequenceClient";

export * from "./spineSequenceClient";

/** Phase 4: usable brief = enough text AND at least one named page/route. */
export function uiBriefUsable(content: string): boolean {
  const text = String(content || "").trim();
  if (uiBriefTooShort(text.length)) return false;
  return parsePagesFromUiBrief(text).length > 0;
}

export {
  RESEARCH_STAGE_BRIEF,
  RESEARCH_STAGE_MERGING,
  RESEARCH_STAGE_SEARCHING,
  RESEARCH_STAGE_WRITING,
  RESEARCH_STOPPED,
} from "./researchStages";
