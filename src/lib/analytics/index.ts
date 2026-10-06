/**
 * Public analytics API. Everything is a no-op unless the build has
 * VITE_POSTHOG_KEY, runs on an allow-listed host, and a signed-in session has
 * started the client (see AnalyticsBridge). Never import posthog-js directly.
 */
import * as client from './client';
import { currentAnalyticsRuntime } from './config';
import { postKeepalive } from './keepalive';
import type { AnalyticsEventMap, EventArgs, PersonProps } from './events';

export * from './events';
export { trackAnonymous } from './anonymous';

/** Records a typed product event for the signed-in user. */
export function track<E extends keyof AnalyticsEventMap>(event: E, ...args: EventArgs<AnalyticsEventMap[E]>): void {
  client.capture(event, args[0] as Record<string, unknown> | undefined);
  // Someone hit a paywall: worth watching what happened next.
  if (event === 'upgrade_prompt_shown') client.forceReplay('upgrade_gate');
}

/**
 * Like {@link track} but for events fired right before the page navigates away
 * (checkout redirect). Sent as a keepalive fetch that does not wait for the
 * SDK chunk (which may still be downloading right after sign-in), so it
 * survives the navigation. Same gates as {@link track}: needs analytics enabled
 * and a signed-in user. Client IP handling is a PostHog project setting
 * ("Discard client IP data"); neither the SDK's `ip` option nor an `?ip=0` param does anything.
 */
export function trackBeacon<E extends keyof AnalyticsEventMap>(event: E, ...args: EventArgs<AnalyticsEventMap[E]>): void {
  const runtime = currentAnalyticsRuntime();
  const userId = client.activeUserId();
  if (!runtime || !userId) return;
  postKeepalive(runtime, event, userId, { ...(args[0] as Record<string, unknown> | undefined) });
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
