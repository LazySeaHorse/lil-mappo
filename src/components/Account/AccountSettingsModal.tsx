import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { Key, Crown, User, Check, AlertCircle } from 'lucide-react';

const BYOK_STORAGE_KEY = 'lil-mappo-mapbox-token';

/**
 * Account Settings modal — always accessible (even signed out).
 * Sections:
 *   - Account Info (signed-in only)
 *   - Subscription (shows tier or upsell)
 *   - BYOK (Mapbox token) — always visible
 */
export function AccountSettingsModal() {
  const { user, showSettingsModal, closeSettingsModal, openAuthModal } = useAuthStore();
  const [mapboxToken, setMapboxToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(BYOK_STORAGE_KEY) || '';
    setMapboxToken(saved);
  }, [showSettingsModal]);

  const handleSaveToken = () => {
    const trimmed = mapboxToken.trim();
    if (trimmed) {
      localStorage.setItem(BYOK_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(BYOK_STORAGE_KEY);
    }
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  };

  const handleClearToken = () => {
    localStorage.removeItem(BYOK_STORAGE_KEY);
    setMapboxToken('');
    setTokenSaved(false);
  };

  const hasToken = !!mapboxToken.trim();

  return (
    <Dialog open={showSettingsModal} onOpenChange={(open) => !open && closeSettingsModal()}>
      <DialogContent className="sm:max-w-lg rounded-2xl bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">Settings</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Account settings and preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2 max-h-[70vh] overflow-y-auto">
          {/* ─── Account Info ─── */}
          {user ? (
            <section>
              <SectionHeading icon={<User size={14} />} label="Account" />
              <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Email</span>
                  <span className="text-xs font-medium">{user.email}</span>
                </div>
                {user.displayName && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Name</span>
                    <span className="text-xs font-medium">{user.displayName}</span>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section>
              <SectionHeading icon={<User size={14} />} label="Account" />
              <div className="bg-secondary/30 rounded-xl p-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Sign in to unlock cloud features.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 rounded-lg px-3 shrink-0"
                  onClick={() => { closeSettingsModal(); openAuthModal(); }}
                >
                  Sign In
                </Button>
              </div>
            </section>
          )}

          {/* ─── Subscription ─── */}
          <section>
            <SectionHeading icon={<Crown size={14} />} label="Subscription" />
            {user ? (
              <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Wanderer</p>
                    <p className="text-[11px] text-muted-foreground">Free tier</p>
                  </div>
                  <Button
                    size="sm"
                    className="text-xs h-8 rounded-lg px-4"
                  >
                    Upgrade
                  </Button>
                </div>
                <div className="h-px bg-border/30" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertCircle size={12} />
                  <span>Upgrade to remove watermarks, unlock cloud renders, and more.</span>
                </div>
              </div>
            ) : (
              <div className="bg-secondary/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Crown size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Unlock More</p>
                    <p className="text-[11px] text-muted-foreground">Cloud renders, cloud saves, remove watermarks, and personal branding.</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ─── BYOK (Mapbox Token) ─── */}
          <section>
            <SectionHeading icon={<Key size={14} />} label="Mapbox API Key (BYOK)" />
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Paste your own Mapbox access token to lift the 30s export limit on local renders. Your token is stored locally and never sent to our servers.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="pk.eyJ1Ijo..."
                  value={mapboxToken}
                  onChange={(e) => { setMapboxToken(e.target.value); setTokenSaved(false); }}
                  className="h-9 rounded-lg bg-background/50 border-border/50 text-xs font-mono placeholder:text-muted-foreground/40 flex-1"
                />
                <Button
                  size="sm"
                  variant={tokenSaved ? 'default' : 'outline'}
                  className="h-9 rounded-lg px-3 text-xs font-semibold shrink-0 min-w-[64px] transition-all"
                  onClick={handleSaveToken}
                  disabled={tokenSaved}
                >
                  {tokenSaved ? (
                    <><Check size={14} className="mr-1" /> Saved</>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
              {hasToken && !tokenSaved && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-destructive hover:text-destructive px-2"
                  onClick={handleClearToken}
                >
                  Remove token
                </Button>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 px-0.5">
      <span className="text-muted-foreground/60">{icon}</span>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">
        {label}
      </h3>
    </div>
  );
}
