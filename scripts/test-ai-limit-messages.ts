import assert from "node:assert/strict";
import {
  BETA_PLATFORM_AI_LIMIT_MESSAGE,
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
  PROVIDER_QUOTA_LIMIT_MESSAGE,
  isNebullaFreeTierLimitError,
  isProviderQuotaLimitError,
  resolveAiLimitUserMessage,
} from "../src/lib/grokKey";

assert.equal(
  isNebullaFreeTierLimitError(FREE_TIER_MONTHLY_LIMIT_MESSAGE),
  true,
  "exact Free-plan copy is Nebulla meter",
);
assert.equal(
  isProviderQuotaLimitError("Your team has reached its monthly spending limit"),
  true,
  "xAI spending limit is provider quota",
);
assert.equal(
  isNebullaFreeTierLimitError("Your team has reached its monthly spending limit"),
  false,
  "xAI spending limit is not Nebulla Free plan",
);

assert.ok(
  resolveAiLimitUserMessage("Your team has reached its monthly spending limit", {
    billingEnabled: false,
    freeTierTokenLimitDisabled: true,
    hasUserByok: false,
  }).includes("No Grok key is saved"),
);
assert.ok(
  resolveAiLimitUserMessage("Your team has reached its monthly spending limit", {
    billingEnabled: false,
    freeTierTokenLimitDisabled: true,
    hasUserByok: true,
  }).includes("account key is saved"),
);
assert.equal(
  resolveAiLimitUserMessage("Your team has reached its monthly spending limit", {
    billingEnabled: false,
    freeTierTokenLimitDisabled: true,
  }),
  PROVIDER_QUOTA_LIMIT_MESSAGE,
);

assert.equal(
  resolveAiLimitUserMessage(FREE_TIER_MONTHLY_LIMIT_MESSAGE, {
    billingEnabled: false,
    freeTierTokenLimitDisabled: true,
  }),
  BETA_PLATFORM_AI_LIMIT_MESSAGE,
);

assert.equal(
  resolveAiLimitUserMessage(FREE_TIER_MONTHLY_LIMIT_MESSAGE, {
    billingEnabled: true,
    freeTierTokenLimitDisabled: false,
  }),
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
);

console.log("test-ai-limit-messages: ok");
