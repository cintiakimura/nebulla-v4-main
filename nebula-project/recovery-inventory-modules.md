# Recovery inventory — runtime modules

| Module | Path | Trigger | Inputs | Outputs | Upstream | Downstream | Status | API-key sensitivity | Class |
|--------|------|---------|--------|---------|----------|------------|--------|---------------------|-------|
| Project key / name | `src/lib/nebulaProjectApi.ts`, `nebulaCloud.ts` | login, create, rename | session, label | browser key/name | auth | all APIs | partial | medium | FIX |
| Start mode | `src/lib/ideStartMode.ts` | My Projects Continue | pending mode | durable mode | UI | bootstrap | working | low | KEEP |
| Home events / pending idea | `src/lib/ideHomeEvents.ts` | Continue | idea, type, guided flag | localStorage | Start UI | AIChat bootstrap | partial | low | FIX |
| Chat bootstrap | `src/lib/ideChatBootstrap.ts` | startGuidedDiscovery | idea, type | hidden user turn | start mode | Grok chat | partial | high | FIX |
| AIChat orchestration | `src/components/ide/AIChat.tsx` | send / bootstrap | history, mode | plan save, mockup, code | detector, bootstrap | pipelines | partial | high | FIX |
| Chat mode detector | `src/lib/chatModeDetector.ts` | each turn | text, plan complete | mode, hints | smartChatHandler | system appendix | working | medium | KEEP |
| Smart chat handler | `src/lib/smartChatHandler.ts` | non-bootstrap turns | text | mode / file preview | detector | AIChat | working | medium | KEEP |
| Inference-first memory | `src/lib/inferenceFirstMemory.ts` | Grok turn | disk files | system appendix | batch memory API | model | partial | high | FIX |
| Memory batch API | `server.ts` `/api/inference-first/memory` | memory loader | paths | file map / nulls | workspace | inference memory | new | low | FIX |
| File open | `src/lib/fileOperations.ts` + `/api/files/open` | open path | path | content / 404 | UI, gates | chat | partial | medium | FIX |
| File apply | `nebulaGrokCodingPipeline.applyGeneratedFiles` + `/api/files/apply-generated` | coding / arch docs | file blocks | written paths | Grok | sync, UI | partial | high | FIX |
| Master Plan persist | `grokChatArtifacts.persistMasterPlanFromAssistantSource` + `/api/master-plan/*` | Grok tags | START_MASTERPLAN | tabs JSON | AIChat | completeness, ui-brief | partial | high | FIX |
| Master Plan completeness | `lib/masterPlanCompleteness.ts` | gates, banner, Go | plan | gaps, allowGo | MP JSON | Go, mockup | working | medium | KEEP |
| UI mockup gate | `src/lib/uiMockupGate.ts` | post-plan | plan + brief | canStart / stage | MP, brief | UI Gen | partial | high | FIX |
| Master Plan UI pipeline | `ideArtifactSync` + `/api/ide/master-plan-ui-pipeline` | after MP save | plan | mind map, ui-brief, v0-prompt | MP | mockup | partial | medium | FIX |
| UI Studio Beta engine | `src/lib/uiStudioBetaEngine.ts` | plan-ready / post-files | brief, plan | mockup model | gate | IdeUiStudioBeta | partial | high | FIX |
| UI Gen v2 | `lib/uiGenerationEngine/v2/*` | Beta generate | brief, tokens | editor model | server | preview | partial | high | KEEP |
| Coding / Go pipeline | `nebulaGrokCodingPipeline.ts` | START_CODING / Go | plan | files | AIChat | apply, NDM | partial | high | FIX |
| Auth / session | `renderStack`, cloud session | load | cookies | user | — | project create | working | medium | KEEP |

## Dependency chain (critical)

```
MyProjectsHome Continue
  → pending idea + start mode + guided flag
  → reset/create project (+ rename on free tier)
  → reload
  → AIChat chatHistoryReady
  → startGuidedDiscovery → Fast Prototype bootstrap
  → /api/grok/chat (one key)
  → persist Master Plan + architecture files
  → master-plan-ui-pipeline (ui-brief)
  → assessUiMockupReadiness → UI Gen
  → foundation coding slice
```

Break any link → empty Untitled / thin plan / mockup-after-coding feeling.
