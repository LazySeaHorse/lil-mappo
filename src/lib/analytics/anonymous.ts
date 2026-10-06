/**
 * Anonymous aggregate counters for signed-out visitors (signup / sign-in
 * funnel, guest gates). Deliberately does NOT load the PostHog SDK: one plain
 * POST through the first-party proxy with a throwaway id, no person profile,
 * no cookies, no storage, no flags call. Obeys the same enable/disable rules
 * as the rest of analytics.
 */
import { APP_VERSION, PROXY_PATH, currentAnalyticsRuntime } from './config';
import type { AnonymousEventMap, EventArgs } from './events';

export function trackAnonymous<E extends keyof AnonymousEventMap>(event: E, ...args: EventArgs<AnonymousEventMap[E]>): void {
  const runtime = currentAnalyticsRuntime();
  if (!runtime) return;
  try {
    void fetch(`${PROXY_PATH}/i/v0/e/`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: runtime.key,
        event,
        distinct_id: crypto.randomUUID(),
        properties: {
          ...args[0],
          $process_person_profile: false,
          environment: runtime.environment,
          app_version: APP_VERSION,
        },
      }),
    }).catch(() => {
      // Counters are best effort.
    });
  } catch {
    // Ignore (no fetch / blocked).
  }
}
