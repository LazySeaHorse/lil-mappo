/**
 * Plain `fetch(..., { keepalive: true })` event sender used by paths that must
 * not depend on the SDK chunk being loaded: the anonymous counters and the
 * identified events fired right before the page navigates away.
 */
import { APP_VERSION, PROXY_PATH, type AnalyticsRuntime } from './config';
import { scrubEvent } from './privacy';

export function postKeepalive(
  runtime: AnalyticsRuntime,
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
  query = '',
): void {
  try {
    const payload = scrubEvent({
      properties: { ...properties, environment: runtime.environment, app_version: APP_VERSION },
    })!;
    void fetch(`${PROXY_PATH}/i/v0/e/${query}`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: runtime.key, event, distinct_id: distinctId, properties: payload.properties }),
    }).catch(() => {
      // Best effort.
    });
  } catch {
    // Ignore (no fetch / blocked).
  }
}
