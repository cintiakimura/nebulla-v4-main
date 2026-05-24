/** Cross-surface bridge: Assistant / Grok tags → IDE Nebula UI Studio. */

export type UiStudioTab = 'design' | 'mockups' | 'preview';

export type OpenUiStudioOptions = {
  tab?: UiStudioTab;
  autoV0?: boolean;
};

const OPEN_EVENT = 'nebula-open-ui-studio';
const RUN_V0_EVENT = 'nebula-ui-studio-run-v0';

type BridgeHandlers = {
  openUiStudio: (opts?: OpenUiStudioOptions) => void;
  runV0Generate: () => void;
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
  const onRunV0 = () => handlers?.runV0Generate();

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

export function dispatchRunV0Generate(): void {
  if (handlers) {
    handlers.runV0Generate();
  } else {
    window.dispatchEvent(new Event(RUN_V0_EVENT));
  }
}

/** Open UI Studio and optionally run first v0 generation (project-execution-rules § v0). */
export function dispatchStartUiUxWorkflow(opts?: OpenUiStudioOptions): void {
  dispatchOpenUiStudio({ tab: opts?.tab ?? 'design', ...opts });
  if (opts?.autoV0 !== false) {
    window.setTimeout(() => dispatchRunV0Generate(), 400);
  }
}
