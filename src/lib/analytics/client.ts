/**
 * PostHog client wrapper. The SDK is loaded lazily (dynamic import) and only
 * after a confirmed Supabase session exists, so signed-out visitors never
 * download or run it. The "no-external" full bundle ships the recorder and
 * exception autocapture inside the lazy chunk, which keeps the CSP unchanged
 * (`connect-src 'self'` covers the same-origin /_m proxy).
 *
 * Every export is safe to call when analytics is disabled or not started.
 */
import type { PostHog, Properties } from 'posthog-js/dist/module.full.no-external';
import { APP_VERSION, PROXY_PATH, REPLAY_SAMPLE_RATE, UI_HOST, currentAnalyticsRuntime } from './config';
import type { PersonProps } from './events';
import { maskReplayText, scrubEvent } from './privacy';

type Instance = PostHog;

/** Calls made while the SDK is still downloading; bounded so a failed load cannot grow memory. */
const MAX_QUEUE = 50;

export interface StartOptions {
  /** Supabase user id. The only identity ever sent (no email). */
  userId: string;
  /** Extra super properties registered on every event (plan, is_mobile, ...). */
  superProps?: Properties;
  /** Runs once the SDK is initialised and identified, before queued calls flush. */
  onReady?: (posthog: Instance) => void;
}

let instance: Instance | null = null;
let initialised = false;
let activeUser: string | null = null;
/** Replay is stopped on purpose (local MP4 export) and must not be restarted by forceReplay. */
let replayPaused = false;
/** Whether replay was running when it was paused, so resume only restarts what was on. */
let replayWasRecording = false;
/** Bumped on every start/stop so a slow dynamic import for a stale user is discarded. */
let generation = 0;
const queue: Array<(posthog: Instance) => void> = [];

/** True while a signed-in session is being tracked (loading or ready). */
export function isActive(): boolean {
  return activeUser !== null;
}

function run(action: (posthog: Instance) => void): void {
  if (!activeUser) return;
  if (instance) {
    try {
      action(instance);
    } catch {
      // Analytics must never break the app.
    }
    return;
  }
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(action);
}

/** Starts tracking for a signed-in user. No-op when analytics is disabled by config. */
export function start(options: StartOptions): void {
  const runtime = currentAnalyticsRuntime();
  if (!runtime) return;
  if (activeUser === options.userId) return;
  if (activeUser) stop();

  activeUser = options.userId;
  const current = ++generation;
  const superProps: Properties = {
    environment: runtime.environment,
    app_version: APP_VERSION,
    ...options.superProps,
  };

  import('posthog-js/dist/module.full.no-external')
    .then(({ default: posthog }) => {
      if (current !== generation || activeUser !== options.userId) return;
      if (!initialised) {
        posthog.init(runtime.key, {
          api_host: `${window.location.origin}${PROXY_PATH}`,
          ui_host: UI_HOST,
          // Cookieless: nothing is written to cookies or storage. Every reload is a new PostHog session.
          persistence: 'memory',
          bootstrap: { distinctID: options.userId, isIdentifiedID: true },
          person_profiles: 'identified_only',
          ip: false,
          autocapture: true,
          mask_all_text: true,
          capture_pageview: false,
          capture_pageleave: true,
          capture_exceptions: true,
          capture_heatmaps: false,
          capture_dead_clicks: false,
          rageclick: false,
          disable_scroll_properties: true,
          disable_session_recording: true,
          disable_surveys: true,
          disable_product_tours: true,
          disable_conversations: true,
          disable_web_experiments: true,
          disable_external_dependency_loading: true,
          // Default-deny masking: every text node is masked unless it sits inside a
          // [data-ph-unmask] region, all inputs are masked, and the map is not recorded at all.
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '*',
            maskTextFn: maskReplayText,
            blockSelector: '.mapboxgl-map',
          },
          before_send: (event) => {
            if (!activeUser) return null;
            if (event?.event === '$exception') forceReplay('error');
            return scrubEvent(event);
          },
        });
        initialised = true;
      } else {
        posthog.reset(true);
        posthog.identify(options.userId);
      }
      posthog.register(superProps);
      instance = posthog;
      // Sampling is decided here (project-level sampling stays at 100%) so it is never applied twice.
      if (!replayPaused && Math.random() < REPLAY_SAMPLE_RATE) posthog.startSessionRecording(true);
      options.onReady?.(posthog);
      const pending = queue.splice(0);
      for (const action of pending) {
        try {
          action(posthog);
        } catch {
          // Ignore: a bad queued call must not drop the rest.
        }
      }
    })
    .catch(() => {
      // Blocked or failed to load (offline, extension): stay silent and drop the queue.
      if (current === generation) queue.length = 0;
    });
}

/** Stops tracking and forgets the identity (sign-out or user switch). */
export function stop(): void {
  generation += 1;
  activeUser = null;
  replayPaused = false;
  replayWasRecording = false;
  queue.length = 0;
  const posthog = instance;
  instance = null;
  if (!posthog) return;
  try {
    posthog.stopSessionRecording();
    posthog.reset(true);
  } catch {
    // Ignore.
  }
}

export function capture(event: string, props?: Record<string, unknown>): void {
  run((posthog) => posthog.capture(event, props));
}

export function register(props: Properties): void {
  run((posthog) => posthog.register(props));
}

export function setPersonProps(props: PersonProps, once?: PersonProps): void {
  run((posthog) => posthog.setPersonProperties(props, once));
}

/**
 * Starts replay for the rest of this session if it is not already running
 * (errors, upgrade gates). Forward-looking only: nothing before this moment is
 * recorded. Ignored while replay is paused for a local export.
 */
export function forceReplay(reason: string): void {
  if (replayPaused) return;
  run((posthog) => {
    if (posthog.sessionRecordingStarted()) return;
    posthog.register({ replay_forced: reason });
    posthog.startSessionRecording(true);
  });
}

/** Stops recording during local MP4 export (heavy main-thread work) and remembers whether it was on. */
export function pauseReplay(): void {
  if (replayPaused) return;
  replayPaused = true;
  const posthog = instance;
  replayWasRecording = !!posthog?.sessionRecordingStarted();
  if (replayWasRecording) {
    try {
      posthog?.stopSessionRecording();
    } catch {
      // Ignore.
    }
  }
}

/** Resumes recording after {@link pauseReplay}, only if it was running before. */
export function resumeReplay(): void {
  if (!replayPaused) return;
  replayPaused = false;
  const resume = replayWasRecording;
  replayWasRecording = false;
  if (resume) run((posthog) => posthog.startSessionRecording(true));
}
