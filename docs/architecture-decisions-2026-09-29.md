# Architecture decisions — 2026-09-29

Locked mapping onto **this repo’s existing Talk → freeze → Go path**. There is no second brain (`agent/` / `master_plan/` were a parallel scaffold and must not be used).

## §1 Two phases

- **Talk (planning):** Grok chat in `AIChat` until `planFrozen` / `planLockedAt` (`PLAN_FROZEN_KEY` in `lib/fullBuildContract.ts`).
- **Execution:** `runGoCodeAndApply` in `src/lib/nebulaGrokCodingPipeline.ts`. Server kick also returns `TALK_NOT_LOCKED` if Talk is still open.

## §2 Chat vs coding during Go

- Talk cannot start Go until the plan is frozen.
- Mid-Go, chat and mic **enqueue** only. They must not abort the in-flight job (Stop is the only cancel).
- After the current Go finishes, queued lines are processed without starting a second Full Build from those notes.

## §3 Lock phrases

Canonical close question: `I think I have everything I need. Anything you want to add?`

Hard accepts (any time): no / nope / nah (whole reply); looks good; that’s all / enough / fine / it; nothing else to add; go ahead; build it; just build; let’s build / let’s go; you can start / you can start coding; start coding; finish building; go / build / now (short).

Close-gated only (last assistant included the close question, whole reply): ok, okay, yes, perfect, good for me, is good for me, it’s good.

Mid-feature “ok” / “yes” (color, a screen) is not a lock.

## §4 Conflicts

Additive notes stay on the frozen plan. A replacement product brief reopens Talk (`isReplacementProductBrief`). Do not silently patch the locked goal.
