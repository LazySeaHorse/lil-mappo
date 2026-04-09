import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { Coins, Zap, Clock, LogIn } from 'lucide-react';

/**
 * Credits modal — shows balance and purchase options.
 * Phase 1: UI shell with placeholder data.
 * Phase 3: Wire to Supabase credit_balance table + Stripe checkout.
 */
export function CreditsModal() {
  const { user, showCreditsModal, closeCreditsModal, openAuthModal } = useAuthStore();

  return (
    <Dialog open={showCreditsModal} onOpenChange={(open) => !open && closeCreditsModal()}>
      <DialogContent className="sm:max-w-md rounded-2xl bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">Credits</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            View your render credit balance.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          /* ─── Not Signed In ─── */
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <LogIn size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm">Sign in to view credits</p>
              <p className="text-muted-foreground text-xs mt-1">
                Credits are used for cloud renders.
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-xl text-xs h-9 px-6"
              onClick={() => { closeCreditsModal(); openAuthModal(); }}
            >
              Sign In
            </Button>
          </div>
        ) : (
          /* ─── Signed In ─── */
          <div className="flex flex-col gap-5 pt-2">
            {/* Balance Cards */}
            <div className="grid grid-cols-2 gap-3">
              <BalanceCard
                icon={<Clock size={16} />}
                label="Monthly"
                value={0}
                sublabel="Resets on renewal"
                variant="monthly"
              />
              <BalanceCard
                icon={<Zap size={16} />}
                label="Purchased"
                value={0}
                sublabel="Never expire"
                variant="purchased"
              />
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
              <Button
                className="w-full h-9 rounded-xl text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                Purchase Credits
              </Button>
            </div>

            {/* Usage History placeholder */}
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
  icon,
  label,
  value,
  sublabel,
  variant,
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
        <span className={variant === 'monthly' ? 'text-blue-400' : 'text-amber-400'}>
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground/60">{sublabel}</p>
    </div>
  );
}
