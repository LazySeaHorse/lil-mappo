/**
 * Anonymous aggregate counters for signed-out visitors (signup / sign-in
 * funnel, guest gates). Deliberately does NOT load the PostHog SDK: one plain
 * POST through the first-party proxy with a throwaway id, no person profile,
 * no cookies, no storage, no flags call. Obeys the same enable/disable rules
 * as the rest of analytics.
 */
import { currentAnalyticsRuntime } from './config';
import type { AnonymousEventMap, EventArgs } from './events';
import { postKeepalive } from './keepalive';

export function trackAnonymous<E extends keyof AnonymousEventMap>(event: E, ...args: EventArgs<AnonymousEventMap[E]>): void {
  const runtime = currentAnalyticsRuntime();
  if (!runtime) return;
  postKeepalive(runtime, event, crypto.randomUUID(), { ...args[0], $process_person_profile: false });
}
