import assert from "node:assert/strict";
import {
  BETA_PLATFORM_AI_LIMIT_MESSAGE,
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
  PROVIDER_PERMISSION_FIX_HINT,
  PROVIDER_PERMISSION_LIMIT_MESSAGE,
  PROVIDER_QUOTA_LIMIT_MESSAGE,
  isNebullaFreeTierLimitError,
  isProviderPermissionError,
  isProviderQuotaLimitError,
  resolveAiLimitUserMessage,
} from "../src/lib/grokKey";
import { isGrokQuotaLimitError } from "../lib/nebulaClaudeFallback";

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

assert.equal(
  isProviderPermissionError("HTTP 403: Forbidden. Ask your team admin for permission."),
  true,
  "403 forbidden is permission",
);
assert.equal(
  isProviderQuotaLimitError("HTTP 403: Forbidden. Ask your team admin for permission."),
  false,
  "403 must not be classified as quota",
);
assert.equal(
  isGrokQuotaLimitError(403, "Forbidden"),
  false,
  "server quota detector must not treat bare 403 as quota",
);
assert.equal(
  isGrokQuotaLimitError(402, "Payment required"),
  true,
  "402 remains quota",
);

assert.ok(
  resolveAiLimitUserMessage("HTTP 403: Forbidden", {
    billingEnabled: false,
    freeTierTokenLimitDisabled: true,
    hasUserByok: true,
  }).includes("403"),
);
assert.ok(
  resolveAiLimitUserMessage("HTTP 403: Forbidden", {}).includes(
    PROVIDER_PERMISSION_LIMIT_MESSAGE.slice(0, 20),
  ),
);
assert.ok(
  resolveAiLimitUserMessage("HTTP 403: Forbidden", {}).includes(
    PROVIDER_PERMISSION_FIX_HINT.slice(0, 20),
  ),
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
