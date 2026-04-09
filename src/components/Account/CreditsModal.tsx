import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { useAuthStore } from '@/store/useAuthStore';
import { useCredits } from '@/hooks/useCredits';
import { SubscriptionTiers } from './SubscriptionTiers';
import {
  Coins, Zap, Clock, Loader2, RefreshCcw,
  Sparkles, CreditCard, LogIn,
} from 'lucide-react';


export function CreditsModal() {
  const { showCreditsModal, closeCreditsModal } = useAuthStore();

  return (
    <Dialog open={showCreditsModal} onOpenChange={(open) => !open && closeCreditsModal()}>
      <DialogContent className="sm:max-w-[600px] rounded-3xl bg-background/95 border-border/30 shadow-2xl p-0 overflow-hidden">
        <div className="p-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
              <Sparkles className="text-primary h-5 w-5" /> Credits & Plans
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Manage your render credits and subscription limits.
            </DialogDescription>
          </DialogHeader>
        </div>
        {showCreditsModal && <CreditsModalBody />}
      </DialogContent>
    </Dialog>
  );
}

function CreditsModalBody() {
  const { user, closeCreditsModal, openCheckoutModal } = useAuthStore();
  const { data: credits, isLoading, error, refetch } = useCredits();

  const [activeTab, setActiveTab] = useState('plans');
  const [purchaseAmount, setPurchaseAmount] = useState<number>(10);
  const minAmount = 10;
  const maxAmount = 200;
  const creditsPerDollar = 100;
  const creditsToGet = purchaseAmount * creditsPerDollar;

  if (isLoading && user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && user) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm font-medium text-destructive">Failed to load credits.</p>
        <Button variant="outline" size="sm" className="rounded-xl text-xs px-4" onClick={() => refetch()}>
          <RefreshCcw size={13} className="mr-1.5" /> Retry Connection
        </Button>
      </div>
    );
  }

  return (
    <div className="px-6 pb-6 pt-2 max-h-[75vh] md:max-h-none overflow-y-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary/50 p-1 rounded-2xl">
          <TabsTrigger value="plans" className="rounded-xl text-sm font-medium">Subscriptions</TabsTrigger>
          <TabsTrigger value="topup" className="rounded-xl text-sm font-medium">Top Up Credits</TabsTrigger>
        </TabsList>

        {/* ── Plans tab ── */}
        <TabsContent value="plans" className="space-y-6 mt-0 outline-none">
          {user && (
            <div className="bg-gradient-to-br from-secondary/40 to-background rounded-2xl border border-border/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available Balance</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-black tabular-nums">
                    {((credits?.monthly_credits ?? 0) + (credits?.purchased_credits ?? 0)).toLocaleString()}
                  </span>
                  <span className="text-sm text-muted-foreground font-medium">credits</span>
                </div>
              </div>
              <div className="flex flex-row sm:flex-col gap-1 items-center sm:items-end flex-wrap">
                {credits?.monthly_credits !== undefined && credits.monthly_credits > 0 && (
                  <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                    <Clock size={10} /> {credits.monthly_credits} Monthly
                  </span>
                )}
                {credits?.purchased_credits !== undefined && credits.purchased_credits > 0 && (
                  <span className="text-xs bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                    <Zap size={10} /> {credits.purchased_credits} Purchased
                  </span>
                )}
              </div>
            </div>
          )}

          <SubscriptionTiers onCheckout={(plan) => { closeCreditsModal(); openCheckoutModal(plan); }} />
        </TabsContent>

        {/* ── Top Up tab ── */}
        <TabsContent value="topup" className="space-y-6 mt-0 outline-none">
          {!user ? (
            <div className="bg-primary/5 rounded-2xl border border-primary/20 p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <LogIn size={20} className="text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">You need a plan first</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Top-up credits are available to subscribers.<br />
                  Subscribe to a plan to get started.
                </p>
              </div>
              <Button
                size="sm"
                className="rounded-xl px-6 font-semibold"
                onClick={() => setActiveTab('plans')}
              >
                View Plans
              </Button>
            </div>
          ) : (
            <div className="bg-gradient-to-tr from-secondary/30 via-secondary/10 to-transparent rounded-2xl border border-border/50 p-6 shadow-inner">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h3 className="text-lg font-bold">Pay as you go</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Purchase credits that never expire.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-primary">${purchaseAmount}</span>
                </div>
              </div>

              <div className="space-y-6">
                <Slider
                  min={minAmount}
                  max={maxAmount}
                  step={5}
                  value={[purchaseAmount]}
                  onValueChange={(val) => setPurchaseAmount(val[0])}
                  className="cursor-grab active:cursor-grabbing py-2"
                />
                <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground px-1">
                  <span>${minAmount}</span>
                  <span>${maxAmount}</span>
                </div>
              </div>

              <div className="mt-8 bg-background/50 rounded-xl p-4 border border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Coins size={20} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">You will receive</p>
                    <p className="text-2xl font-black tracking-tight tabular-nums mt-0.5">
                      {creditsToGet.toLocaleString()} <span className="text-sm font-medium text-muted-foreground ml-1">credits</span>
                    </p>
                  </div>
                </div>
                <Button
                  className="h-11 w-full sm:w-auto px-8 rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5"
                >
                  {/* TODO: Wire to Dodo top-up checkout when live */}
                  <CreditCard className="mr-2 h-4 w-4" /> Checkout
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
