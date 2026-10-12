/**
 * Analytics configuration and the single gate that decides whether PostHog may
 * run at all. Everything here is pure so the "disabled" cases are unit-testable
 * without importing the SDK.
 */

/** First-party path that Vercel rewrites to PostHog EU (see vercel.json). Neutral name on purpose: ad blockers match "posthog"/"analytics". */
export const PROXY_PATH = '/_m';

/** Where PostHog UI links (toolbar, "view in PostHog") point. Not used for traffic. */
export const UI_HOST = 'https://eu.posthog.com';

/** Share of signed-in sessions that get session replay. Forced to 100% on errors / upgrade gates. */
export const REPLAY_SAMPLE_RATE = 0.5;

export type AnalyticsEnvironment = 'production' | 'preview';

/**
 * Hosts allowed to send analytics. Anything else (localhost, Vercel branch
 * deployments, forks, self-hosted copies) is a total no-op.
 */
export const HOST_ENVIRONMENTS: Readonly<Record<string, AnalyticsEnvironment>> = {
  'app.lilmappo.tech': 'production',
  'preview.lilmappo.tech': 'preview',
};

export interface AnalyticsRuntime {
  environment: AnalyticsEnvironment;
  key: string;
}

export interface AnalyticsEnvInput {
  /** Defaults to `import.meta.env.PROD`. */
  prod?: boolean;
  /** Defaults to `import.meta.env.VITE_POSTHOG_KEY`. */
  key?: string;
}

/**
 * Returns the runtime settings when analytics may run, otherwise null.
 * Disabled unless: production build, a key is configured, the host is on the
 * allow-list, the browser is not automated, and the page is not a cloud-render
 * capture (`?render_job=`).
 */
export function resolveAnalyticsEnvironment(
  location: Pick<Location, 'hostname' | 'search'>,
  navigator: Pick<Navigator, 'webdriver'>,
  input: AnalyticsEnvInput = {},
): AnalyticsRuntime | null {
  const prod = input.prod ?? import.meta.env.PROD;
  const key = (input.key ?? import.meta.env.VITE_POSTHOG_KEY ?? '').trim();
  if (!prod || !key) return null;
  if (navigator.webdriver) return null;
  const environment = HOST_ENVIRONMENTS[location.hostname];
  if (!environment) return null;
  if (new URLSearchParams(location.search).has('render_job')) return null;
  return { environment, key };
}

/** Same as {@link resolveAnalyticsEnvironment} for the current page; null outside a browser. */
export function currentAnalyticsRuntime(): AnalyticsRuntime | null {
  if (typeof window === 'undefined') return null;
  return resolveAnalyticsEnvironment(window.location, window.navigator);
}

/** Short build identifier injected by vite.config.ts (`dev` when unavailable). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
