import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useSubscription } from '@/hooks/useSubscription';
import type { PlanSlug } from '@/services/mockCheckout';
import { Coins, Layers, CloudUpload } from 'lucide-react';

function TierCard({
  name, price, credits, parallel, saves, planSlug, highlight, isCurrent, onCheckout,
}: {
  name: string;
  price: string;
  credits: string;
  parallel: string;
  saves: string;
  planSlug?: PlanSlug;
  highlight?: boolean;
  isCurrent?: boolean;
  onCheckout?: (plan: PlanSlug) => void;
}) {
  const { user } = useAuthStore();
  const isFree = !planSlug;

  const handleClick = () => {
    if (isFree) return;
    if (planSlug && onCheckout) onCheckout(planSlug);
  };

  const buttonLabel = isCurrent
    ? 'Current Plan'
    : isFree
      ? null
      : 'Subscribe';

  return (
    <div className={`relative flex flex-col rounded-2xl p-4 border transition-all ${highlight
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

      {(isCurrent || !isFree || user) && buttonLabel !== null ? (
        <Button
          variant={highlight ? 'default' : 'secondary'}
          className={`w-full h-8 text-xs rounded-lg font-semibold ${highlight ? 'shadow-md' : ''}`}
          disabled={isCurrent}
          onClick={handleClick}
        >
          {buttonLabel ?? (isFree ? 'Free Plan' : 'Subscribe')}
        </Button>
      ) : !isFree ? (
        <Button
          variant={highlight ? 'default' : 'secondary'}
          className={`w-full h-8 text-xs rounded-lg font-semibold ${highlight ? 'shadow-md' : ''}`}
          onClick={handleClick}
        >
          Subscribe
        </Button>
      ) : (
        <div className="h-8 flex items-center justify-center">
          <span className="text-xs text-muted-foreground/60 font-medium">No account needed</span>
        </div>
      )}
    </div>
  );
}

export function SubscriptionTiers({
  highlightCurrent = false,
  onCheckout,
}: {
  highlightCurrent?: boolean;
  onCheckout?: (plan: PlanSlug) => void;
}) {
  const { user, openCheckoutModal } = useAuthStore();
  const { data: subscription } = useSubscription();
  const tierSlug = subscription?.tier ?? 'wanderer';

  const handleCheckout = (plan: PlanSlug) => {
    if (onCheckout) {
      onCheckout(plan);
    } else {
      openCheckoutModal(plan);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <TierCard
        name="Wanderer"
        price="Free"
        credits="0 credits/mo"
        parallel="Sequential rendering"
        saves="Local saves only"
        isCurrent={highlightCurrent && (tierSlug === 'wanderer' || !user)}
      />
      <TierCard
        name="Cartographer"
        price="$15/mo"
        credits="500 credits/mo"
        parallel="2 parallel renders"
        saves="Unlimited cloud saves"
        planSlug="cartographer"
        highlight
        isCurrent={highlightCurrent && tierSlug === 'cartographer'}
        onCheckout={handleCheckout}
      />
      <TierCard
        name="Pioneer"
        price="$35/mo"
        credits="2,000 credits/mo"
        parallel="5 parallel renders"
        saves="Unlimited cloud saves"
        planSlug="pioneer"
        isCurrent={highlightCurrent && tierSlug === 'pioneer'}
        onCheckout={handleCheckout}
      />
    </div>
  );
}
