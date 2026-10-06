/**
 * Public analytics API. Everything is a no-op unless the build has
 * VITE_POSTHOG_KEY, runs on an allow-listed host, and a signed-in session has
 * started the client (see AnalyticsBridge). Never import posthog-js directly.
 */
import * as client from './client';
import type { AnalyticsEventMap, EventArgs, PersonProps } from './events';

export * from './events';

/** Records a typed product event for the signed-in user. */
export function track<E extends keyof AnalyticsEventMap>(event: E, ...args: EventArgs<AnalyticsEventMap[E]>): void {
  client.capture(event, args[0] as Record<string, unknown> | undefined);
}

/** Sets person properties (`once` entries are only written if unset). */
export function setPersonProps(props: PersonProps, once?: PersonProps): void {
  client.setPersonProps(props, once);
}
