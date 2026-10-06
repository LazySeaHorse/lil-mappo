import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore, type AuthUser } from '@/store/useAuthStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useSubscription } from '@/hooks/useSubscription';
import { initialAuthCallbackType } from '@/lib/supabase';
import * as client from './client';
import { track } from './index';
import { currentAnalyticsRuntime } from './config';
import type { PersonProps } from './events';

/** Matches the `isMobile` breakpoint in useResponsive. */
const MOBILE_QUERY = '(max-width: 706px)';

/** True once `signed_up` has fired for this page load (the confirmation hash is only present on landing). */
let signedUpReported = false;

function reportSignedUp(user: AuthUser): void {
  if (signedUpReported || initialAuthCallbackType !== 'signup') return;
  signedUpReported = true;
  const attribution = user.signupAttribution ?? {};
  track('signed_up', attribution);
  const initial: PersonProps = {};
  for (const [key, value] of Object.entries(attribution)) {
    (initial as Record<string, string>)[`initial_${key}`] = value;
  }
  if (Object.keys(initial).length > 0) client.setPersonProps({}, initial);
}

function startFor(user: AuthUser): void {
  client.start({
    userId: user.id,
    superProps: { is_mobile: window.matchMedia(MOBILE_QUERY).matches },
  });
  if (user.createdAt) {
    // Date only: the exact signup time adds nothing and is more identifying.
    client.setPersonProps({}, { signed_up_at: user.createdAt.slice(0, 10) });
  }
  reportSignedUp(user);
}

/**
 * Starts PostHog only for a confirmed Supabase session and stops it on
 * sign-out. Signed-out visitors never load the SDK. Zustand notifies
 * subscribers synchronously inside set(), so identity changes are applied
 * before any later event in the same tick.
 */
function Bridge() {
  const location = useLocation();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const subscription = useSubscription();
  const plan = subscription.isSuccess ? (subscription.data?.tier ?? 'free') : undefined;

  useEffect(() => {
    const initial = useAuthStore.getState().user;
    if (initial) startFor(initial);
    return useAuthStore.subscribe((state, prev) => {
      if (state.user?.id === prev.user?.id) return;
      if (state.user) startFor(state.user);
      else client.stop();
    });
  }, []);

  // Local MP4 export saturates the main thread; replay must not compete with it.
  useEffect(() => {
    if (useProjectStore.getState().isExporting) client.pauseReplay();
    return useProjectStore.subscribe((state, prev) => {
      if (state.isExporting === prev.isExporting) return;
      if (state.isExporting) client.pauseReplay();
      else client.resumeReplay();
    });
  }, []);

  // preview_played: once per project per page load. Export drives playback too, so ignore it.
  useEffect(() => {
    const played = new Set<string>();
    return useProjectStore.subscribe((state, prev) => {
      if (!state.isPlaying || prev.isPlaying || state.isExporting) return;
      if (played.has(state.id)) return;
      played.add(state.id);
      track('preview_played');
    });
  }, []);

  useEffect(() => {
    if (!plan) return;
    client.register({ plan });
    client.setPersonProps({ plan });
  }, [userId, plan]);

  // Manual pageviews: only react-router location changes (no history_change).
  // Declared after the start effect so the SDK is already starting.
  useEffect(() => {
    if (userId) client.capture('$pageview');
  }, [userId, location.pathname]);

  return null;
}

export function AnalyticsBridge() {
  const enabled = useMemo(() => currentAnalyticsRuntime() !== null, []);
  return enabled ? <Bridge /> : null;
}
