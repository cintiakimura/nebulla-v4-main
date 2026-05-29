export type GrokActivityTone = 'work' | 'ready' | 'error';

export type GrokActivityStep = {
  label: string;
  detail?: string;
};

export type GrokActivityStatus = {
  headline: string;
  subhead?: string;
  steps: GrokActivityStep[];
  /** Index of the step currently in progress (0-based). Steps before this are done. */
  activeStepIndex: number;
  footer?: string;
  tone: GrokActivityTone;
};

export function createGrokActivity(
  headline: string,
  steps: GrokActivityStep[],
  options?: { subhead?: string; footer?: string; tone?: GrokActivityTone },
): GrokActivityStatus {
  return {
    headline,
    subhead: options?.subhead,
    steps,
    activeStepIndex: 0,
    footer: options?.footer,
    tone: options?.tone ?? 'work',
  };
}

export function advanceGrokActivity(
  prev: GrokActivityStatus,
  activeStepIndex: number,
  patch?: Partial<Pick<GrokActivityStatus, 'headline' | 'subhead' | 'footer' | 'tone'>> & {
    stepDetail?: { index: number; detail: string };
  },
): GrokActivityStatus {
  const next: GrokActivityStatus = {
    ...prev,
    activeStepIndex: Math.min(activeStepIndex, Math.max(0, prev.steps.length - 1)),
    ...patch,
  };
  if (patch?.stepDetail) {
    const steps = [...next.steps];
    const row = steps[patch.stepDetail.index];
    if (row) {
      steps[patch.stepDetail.index] = { ...row, detail: patch.stepDetail.detail };
      next.steps = steps;
    }
  }
  return next;
}

export function finishGrokActivity(
  prev: GrokActivityStatus | null,
  headline: string,
  steps: GrokActivityStep[],
  footer?: string,
): GrokActivityStatus {
  return {
    headline,
    steps,
    activeStepIndex: steps.length,
    footer,
    tone: 'ready',
  };
}

export function errorGrokActivity(
  prev: GrokActivityStatus | null,
  headline: string,
  detail: string,
): GrokActivityStatus {
  const steps = prev?.steps?.length
    ? prev.steps.map((s, i) =>
        i === (prev.activeStepIndex ?? 0)
          ? { ...s, detail }
          : s,
      )
    : [{ label: detail }];
  return {
    headline,
    steps,
    activeStepIndex: prev?.activeStepIndex ?? 0,
    footer: 'You can retry with Go or send another message.',
    tone: 'error',
  };
}
