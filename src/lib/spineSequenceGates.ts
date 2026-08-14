/**
 * Client spine helpers. Do not re-export uiBriefUsable — that pulls Node fs/path
 * (nebulaUiBrief → design-references path.join) and crashes the browser bundle.
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
} from '../../lib/spineSequenceClient';
export type { GoPollPhase } from '../../lib/spineSequenceClient';
