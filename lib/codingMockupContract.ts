/**
 * Shared coding contract: UI Studio mockup / App Preview shell is not the product spec.
 * Imported by Go pipeline prompts, assistant system prompt appendices, and smoke tests.
 */
export const MOCKUP_NON_AUTHORITATIVE_RULE =
  "Do not treat UI Studio mockup / preview-model as the spec. Implement screens and features from Master Plan sections and agreed architecture. Mockup is a temporary preview and may be wrong or partial. If mockup and plan disagree, plan wins. Do not reduce the app to what the mockup happened to draw.";

/** Short bullets for Go / coding system prompts. */
export const MOCKUP_NON_AUTHORITATIVE_GO_BULLETS = `
- Do not treat UI Studio mockup / preview-model as the spec.
- Implement screens and features from Master Plan sections and agreed architecture (roles, pages, data, auth from plan — not mockup pixels).
- Mockup is a temporary preview and may be wrong or partial; if mockup and plan disagree, plan wins.
- Example: plan Kid Home with lessons/progress while mockup wrongly shows Email → build Kid Home from plan, not a login form.
- Auth screens exist because plan/security/roles require them, not because the mockup showed a field.
`.trim();
