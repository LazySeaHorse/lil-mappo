import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import {
  hasByok,
  isMapLoadTracked,
  isGuestBlocked,
  incrementGuestLoadCount,
  getGuestLoadCount,
  GUEST_LOAD_LIMIT,
} from '@/lib/cloudAccess';

export type MapGateReason =
  | 'guest_limit'        // Guest hit the 3-load localStorage limit
  | 'daily_throttled'    // Free signed-in user hit 3 loads today (after 30 this month)
  | 'monthly_exhausted'  // Free signed-in user hit 50 loads this month
  | 'quota_error';       // Quota API unreachable — fail closed rather than granting free access

export interface MapLoadGateState {
  /** False while auth is still loading — don't render Map or gate until known. */
  ready: boolean;
  /** True if the Map should be blocked from loading. */
  blocked: boolean;
  /** Why it was blocked. Null when not blocked. */
  reason: MapGateReason | null;
  /** Remaining guest loads (only relevant when reason === 'guest_limit'). */
  guestLoadsUsed: number;
  /** Called by MapViewport's onLoad event to count the load. */
  onMapLoaded: () => void;
}

export function useMapLoadGate(): MapLoadGateState {
  const { isLoading: authLoading, session } = useAuthStore();
  const { data: subscription, isLoading: subLoading } = useSubscription();

  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState<MapGateReason | null>(null);
  const [guestLoadsUsed, setGuestLoadsUsed] = useState(0);
  const checkedRef = useRef(false);

  useEffect(() => {
    // Don't evaluate until auth + subscription are resolved
    if (authLoading || (session && subLoading)) return;
    if (checkedRef.current) return;
    checkedRef.current = true;

    const byok = hasByok();

    // ── BYOK: always allow, no tracking ───────────────────────────────────────
    if (byok) {
      setReady(true);
      return;
    }

    // ── Guest (not signed in) ─────────────────────────────────────────────────
    if (!session) {
      const count = getGuestLoadCount();
      setGuestLoadsUsed(count);
      if (count >= GUEST_LOAD_LIMIT) {
        setBlocked(true);
        setReason('guest_limit');
      }
      setReady(true);
      return;
    }

    // ── Signed-in user ────────────────────────────────────────────────────────
    if (!isMapLoadTracked(subscription)) {
      // Wanderer — unlimited
      setReady(true);
      return;
    }

    // Free user: call server-side quota check
    fetch('/api/track-map-load', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.allowed) {
          setBlocked(true);
          setReason(data.reason as MapGateReason);
        }
        setReady(true);
      })
      .catch(() => {
        // Fail closed: a quota API error blocks the map rather than granting
        // free unlimited access. Vercel + Supabase outages are rare enough
        // that this is the safer tradeoff.
        setBlocked(true);
        setReason('quota_error');
        setReady(true);
      });
  }, [authLoading, session, subLoading, subscription]);

  const onMapLoaded = () => {
    // For guests: increment the localStorage counter after the map loads
    // (not before, to avoid counting failed loads).
    if (!session && !hasByok()) {
      const next = incrementGuestLoadCount();
      setGuestLoadsUsed(next);
    }
  };

  return { ready, blocked, reason, guestLoadsUsed, onMapLoaded };
}
