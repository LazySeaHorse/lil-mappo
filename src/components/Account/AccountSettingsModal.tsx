import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import { TIER_LABELS } from '@/lib/database.types';
import { Key, Crown, User, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

const BYOK_STORAGE_KEY = 'lil-mappo-mapbox-token';

export function AccountSettingsModal() {
  const { user, showSettingsModal, closeSettingsModal, openAuthModal } = useAuthStore();
  const { data: subscription, isLoading: subLoading } = useSubscription();
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

  // Derived tier info — null subscription = Wanderer (free)
  const tierSlug = subscription?.tier ?? 'wanderer';
  const tierLabel = TIER_LABELS[tierSlug] ?? 'Wanderer';
  const isFree = tierSlug === 'wanderer' || !subscription;
  const renewalDate = subscription?.renewal_date
    ? new Date(subscription.renewal_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Dialog open={showSettingsModal} onOpenChange={(open) => !open && closeSettingsModal()}>
      <DialogContent className="sm:max-w-lg rounded-3xl bg-background/95 backdrop-blur-3xl border-border/40 shadow-2xl p-0 overflow-hidden">
        
        <div className="p-6 pb-2 bg-gradient-to-b from-secondary/30 to-transparent">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
              <User className="text-primary h-5 w-5" /> Settings
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Account preferences and advanced integrations.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col gap-8 px-6 pb-6 pt-4 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent">

          {/* ─── Account Info ─── */}
          <section>
            <SectionHeading icon={<User size={14} />} label="Account" />
            {user ? (
              <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
                <InfoRow label="Email" value={user.email} />
                {user.displayName && <InfoRow label="Name" value={user.displayName} />}
              </div>
            ) : (
              <div className="bg-secondary/30 rounded-xl p-4 flex items-center justify-between gap-3">
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
            )}
          </section>

          {/* ─── Subscription ─── */}
          <section>
            <SectionHeading icon={<Crown size={14} />} label="Subscription" />
            {user ? (
              subLoading ? (
                <div className="bg-secondary/30 rounded-xl p-4 flex items-center justify-center h-16">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{tierLabel}</p>
                      {renewalDate
                        ? <p className="text-[11px] text-muted-foreground">Renews {renewalDate}</p>
                        : <p className="text-[11px] text-muted-foreground">Free tier</p>
                      }
                    </div>
                    <Button size="sm" className="text-xs h-8 rounded-lg px-4">
                      {isFree ? 'Upgrade' : 'Manage'}
                    </Button>
                  </div>
                  {isFree && (
                    <>
                      <div className="h-px bg-border/30" />
                      <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                        <AlertCircle size={12} className="mt-0.5 shrink-0" />
                        <span>Upgrade to remove watermarks, unlock cloud renders &amp; saves, and more.</span>
                      </div>
                    </>
                  )}
                </div>
              )
            ) : (
              <div className="bg-secondary/30 rounded-xl p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Crown size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Unlock More</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Cloud renders, cloud saves, watermark removal, and personal branding.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ─── BYOK ─── */}
          <section>
            <SectionHeading icon={<Key size={14} />} label="Mapbox API Key (BYOK)" />
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Paste your own Mapbox access token to lift the 30s export limit on local renders.
                Your token is stored locally and{' '}
                <span className="font-medium text-foreground">never sent to our servers</span>.{' '}
                <a
                  href="https://account.mapbox.com/access-tokens/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  Get a token <ExternalLink size={10} />
                </a>
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
                  {tokenSaved ? <><Check size={14} className="mr-1" />Saved</> : 'Save'}
                </Button>
              </div>
              {!!mapboxToken.trim() && !tokenSaved && (
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
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="text-muted-foreground/60 p-1.5 bg-secondary/50 rounded-md border border-border/30 shadow-sm">{icon}</span>
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">{label}</h3>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium truncate max-w-[200px]">{value}</span>
    </div>
  );
}
