/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog project key. Optional: without it analytics is a total no-op. */
  readonly VITE_POSTHOG_KEY?: string;
}

/** Short git SHA (or 'dev'), injected by vite.config.ts. */
declare const __APP_VERSION__: string;
