/**
 * Conversation close gate: summary → confirm → plan.
 * Run: npx tsx scripts/test-chat-brainstorm-close.ts
 */
import assert from 'node:assert/strict';
import {
  BRAINSTORM_CLOSE_CONFIRMED_PREFIX,
  buildBrainstormCloseConfirmedBootstrap,
  clearBrainstormCloseState,
  isCloseAddMoreReply,
  isCloseConfirmReply,
  isCloseCorrectReply,
  isSkipSummaryReply,
  looksLikeCloseOffer,
  resolveBrainstormCloseTurn,
} from '../src/lib/chatBrainstormClose.ts';
import {
  buildFastPrototypeBootstrap,
  isHiddenBootstrapUserMessage,
} from '../src/lib/ideChatBootstrap.ts';
import { chatModeSystemAppendix } from '../src/lib/grokChatArtifacts.ts';

const summary = [
  "I think we've got what we need. Here's what I heard — tell me if this is right.",
  'Goal: get something across town today faster than going yourself or using the post office.',
  'Who: sender, rider, receiver.',
  'Features: request a pickup, match a nearby rider, track until drop-off. Wallet and cash are one settle-the-trip job.',
  'Dependencies: we build matching and tracking; maps is a default you can add a key later; pay is a user choice later.',
  "UI: we'll pick a direction after this, unless you care now.",
].join(' ');

assert.equal(looksLikeCloseOffer(summary), true);
assert.equal(looksLikeCloseOffer('If I understood correctly, this exists so delivery works. Is that right?'), false);
assert.equal(looksLikeCloseOffer(`${summary}\n<START_MASTERPLAN>x</END_MASTERPLAN>`), false);

assert.equal(isCloseConfirmReply('yes'), true);
assert.equal(isCloseConfirmReply('faz isso'), true);
assert.equal(isCloseConfirmReply('looks good'), true);
assert.equal(isCloseCorrectReply('no, it’s same-day lab samples only'), true);
assert.equal(isCloseAddMoreReply('wait, also tracking'), true);
assert.equal(isSkipSummaryReply('just build it'), true);

const prior = [{ role: 'assistant', content: summary }];

{
  clearBrainstormCloseState('t-yes');
  const r = resolveBrainstormCloseTurn('yes', prior, 't-yes');
  assert.equal(r.kind, 'confirmed');
  assert.ok(r.summary && r.summary.includes('across town'));
}

{
  clearBrainstormCloseState('t-correct');
  const r = resolveBrainstormCloseTurn('no, it’s same-day lab samples only', prior, 't-correct');
  assert.equal(r.kind, 'correct');
}

{
  clearBrainstormCloseState('t-add');
  const r = resolveBrainstormCloseTurn('wait, also tracking', prior, 't-add');
  assert.equal(r.kind, 'add-more');
}

{
  clearBrainstormCloseState('t-skip');
  const first = resolveBrainstormCloseTurn('just build it', prior, 't-skip');
  assert.equal(first.kind, 'skip-lock');
  const second = resolveBrainstormCloseTurn('just build it', prior, 't-skip');
  assert.equal(second.kind, 'confirmed');
}

{
  clearBrainstormCloseState('t-vague');
  const r = resolveBrainstormCloseTurn('just build it', [], 't-vague');
  assert.equal(r.kind, 'skip-lock');
}

{
  clearBrainstormCloseState('t-yes-bare');
  const r = resolveBrainstormCloseTurn('yes', [], 't-yes-bare');
  assert.equal(r.kind, 'loop');
}

const boot = buildBrainstormCloseConfirmedBootstrap(summary);
assert.ok(boot.startsWith(BRAINSTORM_CLOSE_CONFIRMED_PREFIX));
assert.match(boot, /CONFIRMED_SUMMARY/);
assert.match(boot, /THIS TURN = PLAN ONLY/);
assert.match(boot, /north star/);
assert.match(boot, /Do NOT emit START_CODING/);
assert.ok(isHiddenBootstrapUserMessage(boot));

const seed = buildFastPrototypeBootstrap('motorcycle delivery', 'Web App');
assert.match(seed, /THIS TURN FORBIDDEN/);
assert.match(seed, /That.s a great idea/);
assert.match(seed, /Is that right/);
assert.match(seed, /full idea in mind/);
assert.equal(/THIS TURN = PLAN ONLY/.test(seed), false);
assert.ok(!seed.startsWith(BRAINSTORM_CLOSE_CONFIRMED_PREFIX));

const loopAppendix = chatModeSystemAppendix({
  interactionMode: 'chat',
  codingHint: 'brainstorm-loop',
  discoveryRequired: true,
});
assert.match(loopAppendix, /THIS TURN FORBIDDEN/);
assert.match(loopAppendix, /CHAT_CLOSE/);

const confirmAppendix = chatModeSystemAppendix({
  interactionMode: 'agent',
  codingHint: 'brainstorm-close-confirmed',
  discoveryRequired: false,
  mode: 'architecture',
});
assert.match(confirmAppendix, /BRAINSTORM CLOSE CONFIRMED/);
assert.match(confirmAppendix, /PLAN ONLY/);
assert.match(confirmAppendix, /Do NOT emit START_CODING/);

console.log('test-chat-brainstorm-close: ok');
