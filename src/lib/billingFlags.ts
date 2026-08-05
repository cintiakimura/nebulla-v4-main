/**
 * Beta launch: checkout stays dormant until ops sets BILLING_ENABLED=true.
 * Client prefers `/api/config` `billingEnabled`; defaults to false.
 */
export type BillingConfigSlice = { billingEnabled?: boolean };

export function isBillingCheckoutEnabled(cfg?: BillingConfigSlice | null): boolean {
  if (cfg && typeof cfg.billingEnabled === 'boolean') return cfg.billingEnabled;
  return false;
}

export const BETA_FREE_BANNER =
  'Nebulla beta is free — billing is not required. Paid plans will open after beta.';
