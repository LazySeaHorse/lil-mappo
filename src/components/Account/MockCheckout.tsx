// TODO: This entire component is a mock for testing the checkout flow locally.
// When switching to Dodo Payments, delete this file and replace the "Subscribe"
// button onClick with: initiateMockCheckout() → redirect to Dodo hosted checkout URL.

import React, { useState } from 'react';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/useAuthStore';
import { PLAN_CONFIG, initiateMockCheckout } from '@/services/mockCheckout';
import { Lock, CreditCard, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export function MockCheckout() {
  const { showCheckoutModal, checkoutPlan, closeCheckoutModal } = useAuthStore();

  const [email, setEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [done, setDone] = useState(false);

  if (!checkoutPlan) return null;
  const plan = PLAN_CONFIG[checkoutPlan];

  const formatCard = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsProcessing(true);
    try {
      await initiateMockCheckout(checkoutPlan, email.trim());
      setDone(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeCheckoutModal();
      setTimeout(() => {
        setEmail(''); setCardNumber(''); setExpiry(''); setCvv('');
        setDone(false); setIsProcessing(false);
      }, 200);
    }
  };

  return (
    <Dialog open={showCheckoutModal} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl bg-background/95 backdrop-blur-3xl border-border/40 shadow-2xl p-0 overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                className="w-5 h-5"
                alt="li'l Mappo"
              />
              <span className="font-bold text-sm tracking-tight">li'l Mappo</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck size={11} className="text-green-500" />
              <span>Secure checkout</span>
              {/* TODO: Replace badge with "Powered by Dodo Payments" logo when live */}
              <span className="ml-1 px-1.5 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded text-[10px] font-bold tracking-wide">
                TEST MODE
              </span>
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-secondary/50 rounded-2xl p-4 mb-5 border border-border/30">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">
              Order Summary
            </p>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold text-sm">{plan.name} Plan</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {plan.monthlyCredits.toLocaleString()} credits/mo &middot; {plan.parallelRenders} parallel renders<br />
                  Unlimited cloud saves &middot; Billed monthly
                </p>
              </div>
              <span className="font-black text-xl shrink-0">{plan.price}</span>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          {done ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-green-500" />
              </div>
              <div>
                <p className="font-bold text-sm">Check your email</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  We sent a sign-in link to{' '}
                  <span className="font-semibold text-foreground">{email}</span>.<br />
                  Click it to activate your {plan.name} account.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs rounded-lg"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            /* ── Payment form ── */
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Email address
                </label>
                <Input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 rounded-xl bg-secondary/30 border-border/50 text-sm"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Card number
                </label>
                <div className="relative">
                  <Input
                    placeholder="1234 5678 9012 3456"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCard(e.target.value))}
                    className="h-10 rounded-xl bg-secondary/30 border-border/50 text-sm pr-10 font-mono tracking-wider"
                    inputMode="numeric"
                    maxLength={19}
                  />
                  <CreditCard
                    size={15}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Expiry
                  </label>
                  <Input
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    className="h-10 rounded-xl bg-secondary/30 border-border/50 text-sm font-mono tracking-wider"
                    inputMode="numeric"
                    maxLength={5}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    CVV
                  </label>
                  <Input
                    placeholder="•••"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="h-10 rounded-xl bg-secondary/30 border-border/50 text-sm font-mono"
                    inputMode="numeric"
                    type="password"
                    maxLength={4}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isProcessing || !email.trim()}
                className="h-11 rounded-xl text-sm font-bold mt-1 shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {isProcessing ? (
                  <><Loader2 size={15} className="animate-spin mr-2" />Processing...</>
                ) : (
                  <><Lock size={14} className="mr-2" />Pay {plan.price}</>
                )}
              </Button>

              {/* TODO: Replace with "Secured by Dodo Payments" when live */}
              <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed">
                Test mode — no real payment is processed. Card details are ignored.
              </p>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
