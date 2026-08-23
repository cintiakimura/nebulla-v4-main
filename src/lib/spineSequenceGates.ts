/**
 * Client spine helpers. Do not re-export uiBriefUsable — that pulls Node fs/path
 * (nebulaUiBrief → design-references path.join) and crashes the browser bundle.
 */
export {
  ASK_FOR_SHORT_GOAL,
  GO_CODE_PASS1_LABEL,
  GO_CODE_PASS2_LABEL,
  GO_JOIN_LABEL,
  GO_PREPARING_LABEL,
  GO_SLICE_WAIT_LABEL,
  UI_BRIEF_MIN_CHARS,
  classifyGoPoll,
  goCodePassWaitLabel,
  goPollActivityMessage,
  goPollBackoffMs,
  isUsableProjectGoal,
  isCodingCommandNote,
  extractGoalFromUserNote,
  extractGoalFromMemoryMarkdown,
  extractProductGoalFromSection,
  goalSectionNeedsReseed,
  planRecordHasUsableGoal,
  inferGoalFromPlanRecord,
  seedGoalOfTheAppSection,
  uiBriefTooShort,
} from '../../lib/spineSequenceClient';
export type { GoPollPhase } from '../../lib/spineSequenceClient';
