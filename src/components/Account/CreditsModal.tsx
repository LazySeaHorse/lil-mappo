import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { useAuthStore } from '@/store/useAuthStore';
import { useCredits } from '@/hooks/useCredits';
import { Coins, Zap, Clock, LogIn, Loader2, RefreshCcw, ChevronsUp, Layers, CloudUpload, Sparkles, CreditCard, MoveRight } from 'lucide-react';

export function CreditsModal() {
  const { user, showCreditsModal, closeCreditsModal, openAuthModal } = useAuthStore();
  const { data: credits, isLoading, error, refetch } = useCredits();

  // Top Up State
  const [purchaseAmount, setPurchaseAmount] = useState<number>(10);
  const minAmount = 10;
  const maxAmount = 200;
  const creditsPerDollar = 100;
  const creditsToGet = purchaseAmount * creditsPerDollar;

  return (
    <Dialog open={showCreditsModal} onOpenChange={(open) => !open && closeCreditsModal()}>
      <DialogContent className="sm:max-w-[600px] rounded-3xl bg-background/95 backdrop-blur-2xl border-border/30 shadow-2xl p-0 overflow-hidden">
        
        {/* Header */}
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

        {!user ? (
          <div className="flex flex-col items-center gap-4 py-12 px-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <LogIn size={28} className="text-primary" />
            </div>
            <div className="text-center max-w-[260px]">
              <p className="font-bold text-lg">Sign in to view credits</p>
              <p className="text-muted-foreground text-sm mt-1">Credits are used for parallel cloud renders and higher capacities.</p>
            </div>
            <Button
              className="rounded-xl mt-2 h-10 px-8 font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => { closeCreditsModal(); openAuthModal(); }}
            >
              Sign In
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm font-medium text-destructive">Failed to load credits.</p>
            <Button variant="outline" size="sm" className="rounded-xl text-xs px-4" onClick={() => refetch()}>
              <RefreshCcw size={13} className="mr-1.5" /> Retry Connection
            </Button>
          </div>
        ) : (
          <div className="px-6 pb-6 pt-2">
            <Tabs defaultValue="plans" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary/50 p-1 rounded-2xl">
                <TabsTrigger value="plans" className="rounded-xl text-sm font-medium">Subscriptions</TabsTrigger>
                <TabsTrigger value="topup" className="rounded-xl text-sm font-medium">Top Up Credits</TabsTrigger>
              </TabsList>
              
              <TabsContent value="plans" className="space-y-6 mt-0 outline-none">
                {/* Active Balance Context */}
                <div className="bg-gradient-to-br from-secondary/40 to-background rounded-2xl border border-border/40 p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available Balance</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-3xl font-black tabular-nums">
                        {((credits?.monthly_credits ?? 0) + (credits?.purchased_credits ?? 0)).toLocaleString()}
                      </span>
                      <span className="text-sm text-muted-foreground font-medium">credits</span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col gap-1 items-end">
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

                {/* Tiers */}
                <div className="grid grid-cols-3 gap-3">
                  <TierCard 
                    name="Wanderer"
                    price="Free"
                    credits="0 credits/mo"
                    parallel="Sequential rendering"
                    saves="Local saves only"
                  />
                  <TierCard 
                    name="Cartographer"
                    price="$15/mo"
                    credits="500 credits/mo"
                    parallel="2 parallel renders"
                    saves="Unlimited cloud saves"
                    highlight
                  />
                  <TierCard 
                    name="Pioneer"
                    price="$35/mo"
                    credits="2,000 credits/mo"
                    parallel="5 parallel renders"
                    saves="Unlimited cloud saves"
                  />
                </div>
              </TabsContent>

              <TabsContent value="topup" className="space-y-6 mt-0 outline-none">
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

                  {/* Calculator Result */}
                  <div className="mt-8 bg-background/50 rounded-xl p-4 border border-border/40 flex items-center justify-between">
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
                    <Button className="h-11 px-6 rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5">
                      <CreditCard className="mr-2 h-4 w-4" /> Checkout
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TierCard({
  name, price, credits, parallel, saves, highlight
}: {
  name: string;
  price: string;
  credits: string;
  parallel: string;
  saves: string;
  highlight?: boolean;
}) {
  return (
    <div className={`relative flex flex-col rounded-2xl p-4 border transition-all ${
      highlight 
        ? 'bg-primary/5 border-primary/30 shadow-xl shadow-primary/5 scale-[1.02] z-10' 
        : 'bg-secondary/20 border-border/50 hover:bg-secondary/40'
    }`}>
      {highlight && (
        <div className="absolute -top-3 inset-x-0 flex justify-center">
          <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shadow-sm">
            Popular
          </span>
        </div>
      )}
      <div className="mb-4">
        <h4 className={`font-bold text-lg tracking-tight ${highlight ? 'text-primary' : ''}`}>{name}</h4>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-xl font-black">{price}</span>
        </div>
      </div>
      
      <div className="space-y-3 mb-6 flex-1">
        <div className="flex items-start gap-2">
          <Coins size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground leading-tight">{credits}</span>
        </div>
        <div className="flex items-start gap-2">
          <Layers size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground leading-tight">{parallel}</span>
        </div>
        <div className="flex items-start gap-2">
          <CloudUpload size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground leading-tight">{saves}</span>
        </div>
      </div>

      <Button 
        variant={highlight ? 'default' : 'secondary'}
        className={`w-full h-8 text-xs rounded-lg font-semibold ${highlight ? 'shadow-md' : ''}`}
      >
        {price === 'Free' ? 'Current Plan' : 'Subscribe'}
      </Button>
    </div>
  );
}
