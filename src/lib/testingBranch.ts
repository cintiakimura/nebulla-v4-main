/**
 * Testing branch (ide-shell): UI/UX redesign only — no auth / backend setup.
 * Flip to false (or remove call sites) before merging to main.
 */
export const FORCE_GUEST_MODE = true;

/** Alias: same switch — hide Grok/cloud setup banners and welcome BYOK. */
export const UI_SHELL_ONLY = FORCE_GUEST_MODE;
