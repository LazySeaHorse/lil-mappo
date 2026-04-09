import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useCredits } from '@/hooks/useCredits';
import { Coins, Zap, Clock, LogIn, Loader2, RefreshCcw } from 'lucide-react';

export function CreditsModal() {
  const { user, showCreditsModal, closeCreditsModal, openAuthModal } = useAuthStore();
  const { data: credits, isLoading, error, refetch } = useCredits();

  return (
    <Dialog open={showCreditsModal} onOpenChange={(open) => !open && closeCreditsModal()}>
      <DialogContent className="sm:max-w-md rounded-2xl bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">Credits</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Your render credit balance.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <LogIn size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Sign in to view credits</p>
              <p className="text-muted-foreground text-xs mt-1">Credits are used for cloud renders.</p>
            </div>
            <Button
              size="sm"
              className="rounded-xl text-xs h-9 px-6"
              onClick={() => { closeCreditsModal(); openAuthModal(); }}
            >
              Sign In
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">Failed to load credits.</p>
            <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => refetch()}>
              <RefreshCcw size={13} className="mr-1.5" /> Retry
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            {/* Balance Cards */}
            <div className="grid grid-cols-2 gap-3">
              <BalanceCard
                icon={<Clock size={16} />}
                label="Monthly"
                value={credits?.monthly_credits ?? 0}
                sublabel={
                  credits?.monthly_reset_date
                    ? `Resets ${new Date(credits.monthly_reset_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : 'Resets on renewal'
                }
                variant="monthly"
              />
              <BalanceCard
                icon={<Zap size={16} />}
                label="Purchased"
                value={credits?.purchased_credits ?? 0}
                sublabel="Never expire"
                variant="purchased"
              />
            </div>

            {/* Total line */}
            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span>Total available</span>
              <span className="font-semibold text-foreground tabular-nums">
                {(credits?.monthly_credits ?? 0) + (credits?.purchased_credits ?? 0)} credits
              </span>
            </div>

            {/* Purchase CTA */}
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Coins size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Need more credits?</p>
                  <p className="text-[11px] text-muted-foreground">Purchase credit packs starting at $10.</p>
                </div>
              </div>
              <Button className="w-full h-9 rounded-xl text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]">
                Purchase Credits
              </Button>
            </div>

            {/* Usage History */}
            <div className="px-0.5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70 mb-2">
                Recent Usage
              </h3>
              <div className="bg-secondary/20 rounded-xl p-6 flex items-center justify-center">
                <p className="text-xs text-muted-foreground/50">No render history yet.</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BalanceCard({
  icon, label, value, sublabel, variant,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel: string;
  variant: 'monthly' | 'purchased';
}) {
  return (
    <div className="bg-secondary/30 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={variant === 'monthly' ? 'text-blue-400' : 'text-amber-400'}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-[10px] text-muted-foreground/60">{sublabel}</p>
    </div>
  );
}
