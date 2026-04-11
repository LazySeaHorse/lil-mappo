import React from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubscription } from "@/hooks/useSubscription";
import type { PlanSlug } from "@/services/checkout";
import { Coins, Layers, CloudUpload, Package } from "lucide-react";

// ─── Tier card ────────────────────────────────────────────────────────────────

function TierCard({
  name,
  price,
  credits,
  parallel,
  saves,
  planSlug,
  highlight,
  isCurrent,
  onCheckout,
}: {
  name: string;
  price: string;
  credits: string;
  parallel: string;
  saves: string;
  planSlug: PlanSlug;
  highlight?: boolean;
  isCurrent?: boolean;
  onCheckout?: (plan: PlanSlug) => void;
}) {
  const { startCheckout } = useAuthStore();

  const handleClick = () => {
    if (isCurrent) return;
    if (onCheckout) {
      onCheckout(planSlug);
    } else {
      startCheckout(planSlug);
    }
  };

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-4 border transition-all ${
        highlight
          ? "bg-primary/5 border-primary/30 shadow-xl shadow-primary/5 scale-[1.02] z-10"
          : "bg-secondary/20 border-border/50 hover:bg-secondary/40"
      }`}
    >
      {highlight && (
        <div className="absolute -top-3 inset-x-0 flex justify-center">
          <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shadow-sm">
            Popular
          </span>
        </div>
      )}
      <div className="mb-4">
        <h4
          className={`font-bold text-lg tracking-tight ${highlight ? "text-primary" : ""}`}
        >
          {name}
        </h4>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-xl font-black">{price}</span>
        </div>
      </div>

      <div className="space-y-3 mb-6 flex-1">
        <div className="flex items-start gap-2">
          <Coins size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground leading-tight">
            {credits}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <Layers size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground leading-tight">
            {parallel}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <CloudUpload size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground leading-tight">
            {saves}
          </span>
        </div>
      </div>

      <Button
        variant={highlight ? "default" : "secondary"}
        className={`w-full h-8 text-xs rounded-lg font-semibold ${highlight ? "shadow-md" : ""}`}
        disabled={isCurrent}
        onClick={handleClick}
      >
        {isCurrent ? "Current Plan" : "Subscribe"}
      </Button>
    </div>
  );
}

// ─── Nomad info badge ─────────────────────────────────────────────────────────

function NomadBadge() {
  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5 mb-2">
      <Package size={14} className="text-amber-500 shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed">
        You're on the <span className="font-semibold text-foreground">Nomad</span>{" "}
        tier — granted automatically when you purchase a credit pack. Subscribe
        below to unlock monthly credits and parallel renders.
      </p>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function SubscriptionTiers({
  highlightCurrent = false,
  onCheckout,
}: {
  highlightCurrent?: boolean;
  onCheckout?: (plan: PlanSlug) => void;
}) {
  const { startCheckout } = useAuthStore();
  const { data: subscription } = useSubscription();
  const tierSlug = subscription?.tier ?? null;

  const handleCheckout = (plan: PlanSlug) => {
    if (onCheckout) {
      onCheckout(plan);
    } else {
      startCheckout(plan);
    }
  };

  return (
    <div className="space-y-3">
      {tierSlug === "nomad" && <NomadBadge />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TierCard
          name="Wanderer"
          price="$10/mo"
          credits="100 credits/mo"
          parallel="1 cloud render at a time"
          saves="Unlimited cloud saves"
          planSlug="wanderer"
          isCurrent={highlightCurrent && tierSlug === "wanderer"}
          onCheckout={handleCheckout}
        />
        <TierCard
          name="Cartographer"
          price="$15/mo"
          credits="500 credits/mo"
          parallel="2 parallel renders"
          saves="Unlimited cloud saves"
          planSlug="cartographer"
          highlight
          isCurrent={highlightCurrent && tierSlug === "cartographer"}
          onCheckout={handleCheckout}
        />
        <TierCard
          name="Pioneer"
          price="$35/mo"
          credits="2,000 credits/mo"
          parallel="5 parallel renders"
          saves="Unlimited cloud saves"
          planSlug="pioneer"
          isCurrent={highlightCurrent && tierSlug === "pioneer"}
          onCheckout={handleCheckout}
        />
      </div>
    </div>
  );
}
