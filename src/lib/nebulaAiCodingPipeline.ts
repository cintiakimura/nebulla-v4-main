/**
 * Provider-agnostic name for the Go Code / file-apply pipeline.
 * Implementation remains Grok/xAI-backed for Master Plan + Go Code stability.
 * Import from here in new code; `nebulaGrokCodingPipeline` stays as a compatible alias.
 */
export {
  abortGoCodeWait,
  abortApplyWait,
  ackConsumedGoCodeResult,
  applyArchitectureArtifactsFromAssistant,
  applyGeneratedFiles,
  filterGrokContentToArchitectureFiles,
  handlePostGrokCodingTurn,
  hasGrokFileBlocks,
  isArchitectureArtifactPath,
  isCodingIntent,
  notifyWorkspaceFilesChanged,
  runGoCodeAndApply,
} from './nebulaGrokCodingPipeline';
