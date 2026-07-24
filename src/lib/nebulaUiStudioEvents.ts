/** Cross-surface bridge: Assistant / Grok tags → IDE Nebula UI Studio. */

export type UiStudioTab = 'design' | 'mockups' | 'preview';

export type OpenUiStudioOptions = {
  tab?: UiStudioTab;
  autoV0?: boolean;
};

const OPEN_EVENT = 'nebula-open-ui-studio';
const RUN_V0_EVENT = 'nebula-ui-studio-run-v0';
const CANCEL_V0_EVENT = 'nebula-ui-studio-cancel-v0';
const CLEAR_V0_EVENT = 'nebula-ui-studio-clear-v0';

export type RunV0GenerateOptions = {
  resumeOnly?: boolean;
};

type BridgeHandlers = {
  openUiStudio: (opts?: OpenUiStudioOptions) => void;
  runV0Generate: (opts?: RunV0GenerateOptions) => void;
};

let handlers: BridgeHandlers | null = null;

export function registerNebulaUiStudioBridge(h: BridgeHandlers): () => void {
  handlers = h;

  const w = window as Window & {
    openUIUX?: (opts?: OpenUiStudioOptions) => void;
    startUIUXWorkflow?: (opts?: OpenUiStudioOptions) => void;
  };

  w.openUIUX = (opts) => dispatchOpenUiStudio(opts);
  w.startUIUXWorkflow = (opts) => dispatchStartUiUxWorkflow(opts);

  const onOpen = (ev: Event) => {
    const detail = (ev as CustomEvent<OpenUiStudioOptions>).detail;
    handlers?.openUiStudio(detail);
  };
  const onRunV0 = (ev: Event) => {
    const detail = (ev as CustomEvent<RunV0GenerateOptions>).detail;
    handlers?.runV0Generate(detail);
  };

  window.addEventListener(OPEN_EVENT, onOpen);
  window.addEventListener(RUN_V0_EVENT, onRunV0);

  return () => {
    handlers = null;
    delete w.openUIUX;
    delete w.startUIUXWorkflow;
    window.removeEventListener(OPEN_EVENT, onOpen);
    window.removeEventListener(RUN_V0_EVENT, onRunV0);
  };
}

export function dispatchOpenUiStudio(opts?: OpenUiStudioOptions): void {
  if (handlers) {
    handlers.openUiStudio(opts);
  } else {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: opts ?? {} }));
  }
}

export function dispatchRunV0Generate(opts?: RunV0GenerateOptions): void {
  if (handlers) {
    handlers.runV0Generate(opts);
  } else {
    window.dispatchEvent(new CustomEvent(RUN_V0_EVENT, { detail: opts ?? {} }));
  }
}

/** Stop client poll + cancel server v0 job (chat / UI Studio share this). */
export function dispatchCancelV0(): void {
  window.dispatchEvent(new Event(CANCEL_V0_EVENT));
}

/** Clear stale v0 pending state on the server. */
export function dispatchClearV0Session(): void {
  window.dispatchEvent(new Event(CLEAR_V0_EVENT));
}

export const NEBULA_UI_STUDIO_CANCEL_V0 = CANCEL_V0_EVENT;
export const NEBULA_UI_STUDIO_CLEAR_V0 = CLEAR_V0_EVENT;

/** Open UI Studio and optionally run first v0 generation. Default: no auto V0 (UI Studio Beta is active generator). */
export function dispatchStartUiUxWorkflow(opts?: OpenUiStudioOptions): void {
  dispatchOpenUiStudio({ tab: opts?.tab ?? 'design', ...opts });
  if (opts?.autoV0 === true) {
    window.setTimeout(() => dispatchRunV0Generate(), 400);
  }
}
