/**
 * Operator readiness signals (no secrets in output).
 */
import { isR2Configured } from "./nebulaR2Storage";
import {
  getWorkspaceStorageMode,
  isWorkspaceR2Configured,
} from "./nebulaWorkspaceStorage";

export type OpsReadiness = {
  nodeEnv: string;
  workspaceStorageMode: "local" | "r2" | "dual";
  workspaceR2Ready: boolean;
  r2CredentialsConfigured: boolean;
  durableWorkspaceOk: boolean;
  billingEnabled: boolean;
  rateLimitDisabled: boolean;
  appPreviewPublic: boolean;
  figmaKeysConfigured: boolean;
  figmaApiKeyConfigured: boolean;
  warnings: string[];
};

export function getOpsReadiness(): OpsReadiness {
  const mode = getWorkspaceStorageMode();
  const workspaceR2Ready = isWorkspaceR2Configured();
  const r2CredentialsConfigured = isR2Configured();
  const durableWorkspaceOk =
    mode === "local" ? process.env.NODE_ENV !== "production" : workspaceR2Ready;

  const warnings: string[] = [];
  if (process.env.NODE_ENV === "production" && mode === "local") {
    warnings.push(
      "WORKSPACE_STORAGE=local on production — project files may be lost on Render restart. Set dual or r2 with R2 credentials.",
    );
  }
  if ((mode === "dual" || mode === "r2") && !workspaceR2Ready) {
    warnings.push(
      "WORKSPACE_STORAGE needs R2 (credentials + WORKSPACE_R2_BUCKET / R2_BUCKET_2_NAME / R2_BUCKET_NAME).",
    );
  }
  if ((process.env.APP_PREVIEW_PUBLIC || "").trim() === "true") {
    warnings.push("APP_PREVIEW_PUBLIC=true — preview authz is disabled.");
  }
  if ((process.env.RATE_LIMIT_DISABLED || "").trim() === "true") {
    warnings.push("RATE_LIMIT_DISABLED=true — auth/AI rate limits are off.");
  }
  if ((process.env.BILLING_ENABLED || "").trim() === "true") {
    warnings.push(
      "BILLING_ENABLED=true but Stripe webhooks are not implemented — tiers will not auto-upgrade.",
    );
  }
  const figmaKeys = (process.env.FIGMA_REFERENCE_FILE_KEYS || "").trim();
  const figmaKey = (process.env.FIGMA_API_KEY || "").trim();
  if (figmaKey && !figmaKeys) {
    warnings.push("FIGMA_API_KEY set but FIGMA_REFERENCE_FILE_KEYS empty — Figma will not drive layout.");
  }

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    workspaceStorageMode: mode,
    workspaceR2Ready,
    r2CredentialsConfigured,
    durableWorkspaceOk,
    billingEnabled: process.env.BILLING_ENABLED === "true",
    rateLimitDisabled: (process.env.RATE_LIMIT_DISABLED || "").trim() === "true",
    appPreviewPublic: (process.env.APP_PREVIEW_PUBLIC || "").trim() === "true",
    figmaKeysConfigured: Boolean(figmaKeys),
    figmaApiKeyConfigured: Boolean(figmaKey),
    warnings,
  };
}

/** Log warnings at boot (never prints secret values). */
export function logOpsReadinessAtBoot(): void {
  const ops = getOpsReadiness();
  console.log(
    `[nebula] ops: storage=${ops.workspaceStorageMode} durable=${ops.durableWorkspaceOk} figmaKeys=${ops.figmaKeysConfigured} billing=${ops.billingEnabled}`,
  );
  for (const w of ops.warnings) {
    console.warn(`[nebula] ops warning: ${w}`);
  }
}
