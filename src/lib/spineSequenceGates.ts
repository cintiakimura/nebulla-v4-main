/**
 * Client re-export of spine sequence helpers (repo-root lib/).
 * AIChat and other src/components files import via ../../lib/…
 */
export {
  ASK_FOR_SHORT_GOAL,
  GO_JOIN_LABEL,
  GO_PREPARING_LABEL,
  GO_SLICE_WAIT_LABEL,
  UI_BRIEF_MIN_CHARS,
  classifyGoPoll,
  goPollActivityMessage,
  isUsableProjectGoal,
  uiBriefTooShort,
  uiBriefUsable,
} from '../../lib/spineSequenceGates';
export type { GoPollPhase } from '../../lib/spineSequenceGates';
