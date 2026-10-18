import React, { useEffect } from 'react';
import { Mappo } from '@/components/Mappo/Mappo';
import type { MappoMood } from '@/components/Mappo/moods';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapLoadGate } from '@/hooks/useMapLoadGate';
import { isAppOwnKey, BYOK_STORAGE_KEY } from '@/config/mapbox';
import { trackAnonymous } from '@/lib/analytics/anonymous';
import secureLocalStorage from "react-secure-storage";

interface MapLoadGateProps {
  children: React.ReactNode;
}

/**
 * Wraps the MapViewport and blocks it from mounting when the user has exceeded
 * their map load quota. This prevents the Mapbox API call from happening at all
 * once the limit is reached.
 *
 * Usage in parent:
 *   const gate = useMapLoadGate();
 *   <MapLoadGate gate={gate}>
 *     <MapViewport onMapReady={gate.onMapLoaded} ... />
 *   </MapLoadGate>
 */
export function MapLoadGate({
  gate,
  children,
}: MapLoadGateProps & { gate: ReturnType<typeof useMapLoadGate> }) {
  const { openAuthModal, openUpgradeModal } = useAuthStore(
    useShallow((s) => ({
      openAuthModal: s.openAuthModal,
      openUpgradeModal: s.openUpgradeModal,
    })),
  );

  // While auth is loading, render nothing (map stays unmounted — no API call)
  if (!gate.ready) return null;

  if (gate.blocked) {
    return (
      <MapLoadBlockedScreen
        reason={gate.reason!}
        onSignIn={openAuthModal}
        onUpgrade={() => openUpgradeModal('map_load_gate')}
      />
    );
  }

  return <>{children}</>;
}

// ─── Blocked screen ───────────────────────────────────────────────────────────

const BLOCKED_MOOD: Record<'guest_limit' | 'daily_throttled' | 'monthly_exhausted' | 'quota_error', MappoMood> = {
  guest_limit: 'sleepy',
  daily_throttled: 'sleepy',
  monthly_exhausted: 'sleepy',
  quota_error: 'inquisitive',
};

function MapLoadBlockedScreen({
  reason,
  onSignIn,
  onUpgrade,
}: {
  reason: 'guest_limit' | 'daily_throttled' | 'monthly_exhausted' | 'quota_error';
  onSignIn: () => void;
  onUpgrade: () => void;
}) {
  // A guest ran into the map-load limit (anonymous aggregate counter).
  useEffect(() => {
    if (reason === 'guest_limit') trackAnonymous('guest_gate_hit', { where: 'map_load' });
  }, [reason]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm z-50 gap-6 p-6 text-center">
      <Mappo mood={BLOCKED_MOOD[reason]} title="Mappo" className="h-24 w-auto drop-shadow-lg" />

      {reason === 'guest_limit' && (
        <>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-medium tracking-tight">Mappo is napping</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">Sign in to wake Mappo up. It is free.</p>
          </div>
          <Button size="xl" onClick={onSignIn}>
            Sign in / Create account
          </Button>
        </>
      )}

      {reason === 'daily_throttled' && (
        <>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-medium tracking-tight">Daily limit reached</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You reached the daily limit of 3 map loads. Return tomorrow, or upgrade
              to Wanderer for unlimited loads.
            </p>
          </div>
          <div className="flex gap-3">
            <Button size="lg" variant="outline" onClick={onUpgrade}>
              Upgrade
            </Button>
          </div>
        </>
      )}

      {reason === 'monthly_exhausted' && (
        <>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-medium tracking-tight">Monthly limit reached</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We detected unusual activity on your account. Add your personal
              Mapbox token (BYOK), upgrade to Wanderer, or wait until the next month.
            </p>
          </div>
          <div className="flex gap-3">
            <Button size="lg" onClick={onUpgrade}>
              Upgrade
            </Button>
            <BYOKQuickEntry />
          </div>
        </>
      )}

      {reason === 'quota_error' && (
        <>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-medium tracking-tight">Something went wrong</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The app cannot connect to the server. Check your connection and try again.
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Inline BYOK entry for the monthly_exhausted state ───────────────────────

function BYOKQuickEntry() {
  const [token, setToken] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSave = () => {
    const t = token.trim();
    if (!t) return;
    if (isAppOwnKey(t)) {
      setError("This token is the default app token. Enter your personal Mapbox token.");
      return;
    }
    setError('');
    secureLocalStorage.setItem(BYOK_STORAGE_KEY, t);
    setSaved(true);
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="flex flex-col gap-1.5 items-start">
      <div className="flex gap-2 items-center">
        <input
          type="password"
          placeholder="pk.eyJ1Ijo… (your Mapbox key)"
          value={token}
          onChange={(e) => { setToken(e.target.value); setError(''); }}
          className="h-10 rounded-lg bg-secondary/50 border border-border/50 text-xs font-mono px-3 w-56 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <Button
          size="lg"
          variant="outline"
          onClick={handleSave}
          disabled={!token.trim() || saved}
        >
          {saved ? 'Saved' : 'Save token'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive pl-1">{error}</p>}
    </div>
  );
}
