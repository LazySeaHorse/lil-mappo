/**
 * Public analytics API. Everything is a no-op unless the build has
 * VITE_POSTHOG_KEY, runs on an allow-listed host, and a signed-in session has
 * started the client (see AnalyticsBridge). Never import posthog-js directly.
 */
import * as client from './client';
import type { AnalyticsEventMap, EventArgs, PersonProps } from './events';

export * from './events';
export { trackAnonymous } from './anonymous';

/** Records a typed product event for the signed-in user. */
export function track<E extends keyof AnalyticsEventMap>(event: E, ...args: EventArgs<AnalyticsEventMap[E]>): void {
  client.capture(event, args[0] as Record<string, unknown> | undefined);
  // Someone hit a paywall: worth watching what happened next.
  if (event === 'upgrade_prompt_shown') client.forceReplay('upgrade_gate');
}

/** Sets person properties (`once` entries are only written if unset). */
export function setPersonProps(props: PersonProps, once?: PersonProps): void {
  client.setPersonProps(props, once);
}

/** Starts replay for the rest of the session (forward-looking only). No-op if already recording or paused. */
export function forceReplay(reason: string): void {
  client.forceReplay(reason);
}

/** Pauses replay (e.g. during local export). */
export function pauseReplay(): void {
  client.pauseReplay();
}

/** Resumes replay if it was running before {@link pauseReplay}. */
export function resumeReplay(): void {
  client.resumeReplay();
}
