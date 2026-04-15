import React from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubscription } from "@/hooks/useSubscription";
import { type PlanSlug, PLAN_CONFIG } from "@/services/checkout";
import { Coins, Layers, CloudUpload, Package, Timer } from "lucide-react";

// ─── Tier card ────────────────────────────────────────────────────────────────

function TierCard({
  name,
  price,
  creditsCount,
  parallel,
  saves,
  planSlug,
  highlight,
  isCurrent,
  comingSoon,
  onCheckout,
}: {
  name: string;
  price: string;
  creditsCount: number;
  parallel: string;
  saves: string;
  planSlug: PlanSlug;
  highlight?: boolean;
  isCurrent?: boolean;
  // CLOUD RENDERING TEMPORARILY DISABLED — not dead code.
  // Remove comingSoon prop and restore normal behaviour once GPU acceleration
  // is working in the Modal render worker.
  comingSoon?: boolean;
  onCheckout?: (plan: PlanSlug) => void;
}) {
  const { startCheckout } = useAuthStore();

  const handleClick = () => {
    if (isCurrent || comingSoon) return;
    if (onCheckout) {
      onCheckout(planSlug);
    } else {
      startCheckout(planSlug);
    }
  };

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-4 border transition-all ${comingSoon
        ? "bg-secondary/10 border-border/30 opacity-50 cursor-not-allowed"
        : highlight
          ? "bg-primary/5 border-primary/30 shadow-xl shadow-primary/5 scale-[1.02] z-10"
          : "bg-secondary/20 border-border/50 hover:bg-secondary/40"
        }`}
    >
      {comingSoon && (
        <div className="absolute -top-3 inset-x-0 flex justify-center">
          <span className="bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shadow-sm">
            soon™
          </span>
        </div>
      )}
      {!comingSoon && highlight && (
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
            {creditsCount.toLocaleString()} credits/mo
          </span>
        </div>
        <div className="flex items-start gap-2">
          <Timer size={14} className="mt-0.5 shrink-0 text-primary" />
          <span className="text-xs font-bold text-primary leading-tight">
            {(creditsCount / 8).toLocaleString()} mins of 1080p
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
        variant={highlight && !comingSoon ? "default" : "secondary"}
        className={`w-full h-8 text-xs rounded-lg font-semibold ${highlight && !comingSoon ? "shadow-md" : ""}`}
        disabled={isCurrent || comingSoon}
        onClick={handleClick}
      >
        {isCurrent ? "Current Plan" : comingSoon ? "Coming soon" : "Subscribe"}
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
          name={PLAN_CONFIG.wanderer.name}
          price={PLAN_CONFIG.wanderer.price}
          creditsCount={PLAN_CONFIG.wanderer.monthlyCredits}
          parallel={`No parallel cloud renders`}
          saves="Unlimited cloud saves"
          planSlug="wanderer"
          isCurrent={highlightCurrent && tierSlug === "wanderer"}
          onCheckout={handleCheckout}
        />
        {/* CLOUD RENDERING TEMPORARILY DISABLED — not dead code.
            Remove comingSoon props from Cartographer and Pioneer once GPU
            acceleration is working in the Modal render worker. */}
        <TierCard
          name={PLAN_CONFIG.cartographer.name}
          price={PLAN_CONFIG.cartographer.price}
          creditsCount={PLAN_CONFIG.cartographer.monthlyCredits}
          parallel={`${PLAN_CONFIG.cartographer.parallelRenders} parallel renders`}
          saves="Unlimited cloud saves"
          planSlug="cartographer"
          highlight
          comingSoon
          isCurrent={highlightCurrent && tierSlug === "cartographer"}
          onCheckout={handleCheckout}
        />
        <TierCard
          name={PLAN_CONFIG.pioneer.name}
          price={PLAN_CONFIG.pioneer.price}
          creditsCount={PLAN_CONFIG.pioneer.monthlyCredits}
          parallel={`${PLAN_CONFIG.pioneer.parallelRenders} parallel renders`}
          saves="Unlimited cloud saves"
          planSlug="pioneer"
          comingSoon
          isCurrent={highlightCurrent && tierSlug === "pioneer"}
          onCheckout={handleCheckout}
        />
      </div>
    </div>
  );
}
