/// <reference types="vite/client" />

/** Injected at build time (see `vite.config.ts` — Render: `RENDER_GIT_COMMIT`, etc.) */
declare const __NEBULLA_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE_URL?: string;
  /** Must match server `GUARDIAN_REPORT_KEY` for silent error reports. */
  readonly VITE_GUARDIAN_REPORT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
