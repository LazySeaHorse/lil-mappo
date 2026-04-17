import React from 'react';
import { MapPin, Calendar, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useMapLoadGate } from '@/hooks/useMapLoadGate';
import { GUEST_LOAD_LIMIT } from '@/lib/cloudAccess';
import { isAppOwnKey, BYOK_STORAGE_KEY } from '@/config/mapbox';
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
  const { openAuthModal } = useAuthStore();

  // While auth is loading, render nothing (map stays unmounted — no API call)
  if (!gate.ready) return null;

  if (gate.blocked) {
    return (
      <MapLoadBlockedScreen
        reason={gate.reason!}
        guestLoadsUsed={gate.guestLoadsUsed}
        onSignIn={openAuthModal}
      />
    );
  }

  return <>{children}</>;
}

// ─── Blocked screen ───────────────────────────────────────────────────────────

function MapLoadBlockedScreen({
  reason,
  guestLoadsUsed,
  onSignIn,
}: {
  reason: 'guest_limit' | 'daily_throttled' | 'monthly_exhausted' | 'quota_error';
  guestLoadsUsed: number;
  onSignIn: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm z-50 gap-6 p-6 text-center">
      <div className="p-4 bg-primary/10 rounded-3xl border border-primary/20 shadow-lg">
        {reason === 'monthly_exhausted' ? (
          <Calendar className="w-10 h-10 text-primary" />
        ) : reason === 'quota_error' ? (
          <RefreshCw className="w-10 h-10 text-primary" />
        ) : (
          <MapPin className="w-10 h-10 text-primary" />
        )}
      </div>

      {reason === 'guest_limit' && (
        <>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-black tracking-tight">Sign in to continue</h2>
          </div>
          <Button className="rounded-xl px-8 h-11 font-semibold" onClick={onSignIn}>
            Sign in / Create account
          </Button>
        </>
      )}

      {reason === 'daily_throttled' && (
        <>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-black tracking-tight">Daily limit reached</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You've used your 3 map loads for today. Come back tomorrow, or upgrade
              to Wanderer for unlimited loads.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="rounded-xl px-6 h-10 font-semibold" onClick={onSignIn}>
              Upgrade
            </Button>
          </div>
        </>
      )}

      {reason === 'monthly_exhausted' && (
        <>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-black tracking-tight">Monthly limit reached</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Unusual activity was detected on your account. You can add your own
              Mapbox key (BYOK), upgrade to Wanderer, or wait until the 1st of next month.
            </p>
          </div>
          <div className="flex gap-3">
            <Button className="rounded-xl px-6 h-10 font-semibold" onClick={onSignIn}>
              Upgrade
            </Button>
            <BYOKQuickEntry />
          </div>
        </>
      )}

      {reason === 'quota_error' && (
        <>
          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-black tracking-tight">Something went wrong</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Couldn't reach the server. Please check your connection and try again.
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-xl px-6 h-10 font-semibold"
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
      setError("That's the app's built-in key — please enter your own.");
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
          className="h-10 rounded-xl bg-secondary/50 border border-border/50 text-xs font-mono px-3 w-56 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <Button
          variant="outline"
          className="rounded-xl px-4 h-10 font-semibold text-xs"
          onClick={handleSave}
          disabled={!token.trim() || saved}
        >
          {saved ? 'Saved…' : 'Use my key'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive pl-1">{error}</p>}
    </div>
  );
}
