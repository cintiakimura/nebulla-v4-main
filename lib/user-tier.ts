/**
 * Billing / capability tiers for Nebula Partner (chat model + agents).
 */

export type UserTier = "free" | "pro" | "power";

export const FREE_TIER_MONTHLY_TOKEN_LIMIT = 60_000;

export type ChatModelFamily = "grok-3" | "grok-4.1";

export type UserCapabilities = {
  tier: UserTier;
  /** `null` = no monthly cap (Pro / Power). */
  monthlyTokenLimit: number | null;
  /** Default or max chat lane for the tier. */
  allowedChatModel: ChatModelFamily;
  /** Multi-agent swarm (Planner / Researcher / …) — Power only. */
  agentsEnabled: boolean;
  /** Power: metered usage / billing (product flag; integrate with Stripe etc.). */
  usageBasedBilling: boolean;
};

const TIER_SET = new Set<UserTier>(["free", "pro", "power"]);

export function normalizeUserTier(raw: string | null | undefined): UserTier {
  const t = String(raw || "free")
    .trim()
    .toLowerCase();
  if (t === "pro" || t === "power" || t === "free") return t;
  return "free";
}

/**
 * Resolves what the product allows for chat model, agents, and token caps.
 */
export function getUserCapabilities(user: { tier?: string | null } | null | undefined): UserCapabilities {
  const tier = normalizeUserTier(user?.tier ?? undefined);
  if (tier === "pro") {
    return {
      tier: "pro",
      monthlyTokenLimit: null,
      allowedChatModel: "grok-4.1",
      agentsEnabled: false,
      usageBasedBilling: false,
    };
  }
  if (tier === "power") {
    return {
      tier: "power",
      monthlyTokenLimit: null,
      allowedChatModel: "grok-4.1",
      agentsEnabled: true,
      usageBasedBilling: true,
    };
  }
  return {
    tier: "free",
    monthlyTokenLimit: FREE_TIER_MONTHLY_TOKEN_LIMIT,
    allowedChatModel: "grok-3",
    agentsEnabled: false,
    usageBasedBilling: false,
  };
}

export function isUserTier(v: string): v is UserTier {
  return TIER_SET.has(v as UserTier);
}
