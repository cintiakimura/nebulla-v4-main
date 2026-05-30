/** Pre-flight checks before starting or resuming v0 generation. */

export type V0ReadinessInput = {
  hasV0ApiKey?: boolean | null;
  hasLocalV0ApiKey?: boolean;
  v0ServerReady?: boolean | null;
  v0PromptExists?: boolean;
  v0PromptLength?: number;
  v0Starting?: boolean;
  v0PendingChatId?: string;
  v0StartError?: string;
  hasRealV0?: boolean;
};

export type V0ReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
};

export type V0ReadinessResult = {
  ready: boolean;
  checks: V0ReadinessCheck[];
  /** Short message when Generate should be blocked. */
  blockReason?: string;
  /** Resume poll only — no new v0-start charge. */
  resumeOnly: boolean;
};

export function computeV0Readiness(input: V0ReadinessInput): V0ReadinessResult {
  const hasKey =
    input.hasV0ApiKey === true ||
    Boolean(input.hasLocalV0ApiKey) ||
    input.v0ServerReady === true;
  const promptOk = Boolean(input.v0PromptExists) && (input.v0PromptLength ?? 0) > 80;
  const chatId = input.v0PendingChatId?.trim();
  const starting = Boolean(input.v0Starting);
  const resumeOnly = Boolean((chatId || starting) && !input.hasRealV0);

  const checks: V0ReadinessCheck[] = [
    {
      id: 'key',
      label: 'v0 API key',
      ok: hasKey,
      hint: hasKey
        ? input.v0ServerReady
          ? 'Set on server (Render V0_API_KEY)'
          : 'Saved in this browser — server env recommended on Render'
        : 'My services → v0 API key, or V0_API_KEY on Render',
    },
    {
      id: 'prompt',
      label: 'v0 prompt (Master Plan §4 + §5)',
      ok: promptOk,
      hint: promptOk
        ? `${input.v0PromptLength ?? 0} chars in nebula-ui-studio/v0-prompt.md`
        : 'Save Master Plan tabs §4 Pages and §5 UI/UX first',
    },
  ];

  if (input.v0StartError && chatId) {
    checks.push({
      id: 'apply',
      label: 'Last v0 apply',
      ok: false,
      hint: input.v0StartError,
    });
  } else if (starting || chatId) {
    checks.push({
      id: 'session',
      label: 'v0 session',
      ok: true,
      hint: starting
        ? 'Starting on server — poll only (no new charge)'
        : `In progress (chat ${chatId!.slice(0, 8)}…) — resume, do not Generate again`,
    });
  }

  let blockReason: string | undefined;
  if (!hasKey) {
    blockReason = 'Add your v0 API key in My services or set V0_API_KEY on Render, then redeploy.';
  } else if (!promptOk) {
    blockReason =
      'Save Master Plan §4 (Pages) and §5 (UI/UX) so nebula-ui-studio/v0-prompt.md is filled in.';
  } else if (input.v0StartError && !chatId) {
    blockReason = input.v0StartError;
  }

  const ready = !blockReason;
  return { ready, checks, blockReason, resumeOnly };
}
