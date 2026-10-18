import React from "react";
import { PinDropHero } from "@/components/ui/pin-drop";
import { pinDropContentClass, popupTextClass, popupTitleClass } from "@/components/ui/popup-variants";
import { cn } from "@/lib/utils";
import {
  Check,
  Cloud,
  Crown,
  Film,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { PLAN_CONFIG } from "@/services/checkout";
import { useAuthStore } from "@/store/useAuthStore";
import { useShallow } from "zustand/react/shallow";
import { FREE_CLOUD_SAVE_LIMIT, FREE_LIMITS, isWanderer } from "@/lib/cloudAccess";

const BENEFITS = [
  {
    label: "Cloud projects",
    free: `${FREE_CLOUD_SAVE_LIMIT} projects`,
    paid: "Unlimited",
    icon: Cloud,
  },
  {
    label: "Cloud sync",
    free: "Manual sync",
    paid: "Automatic sync",
    icon: RefreshCw,
  },
  {
    label: "Video export",
    free: `${FREE_LIMITS.maxResolution}, ${FREE_LIMITS.maxFps} FPS`,
    paid: "Up to 4K, 60 FPS",
    icon: Film,
  },
  {
    label: "Maximum duration",
    free: `${FREE_LIMITS.maxDuration} seconds`,
    paid: "Unlimited",
    icon: Gauge,
  },
  {
    label: "Watermark on exports",
    free: "Yes",
    paid: "No",
    icon: ShieldCheck,
  },
  {
    label: "Create animations with AI",
    free: "Not included",
    paid: "Experimental",
    icon: Sparkles,
  },
] as const;

export function UpgradeModal() {
  const { showUpgradeModal, closeUpgradeModal, startCheckout } = useAuthStore(
    useShallow((s) => ({
      showUpgradeModal: s.showUpgradeModal,
      closeUpgradeModal: s.closeUpgradeModal,
      startCheckout: s.startCheckout,
    })),
  );
  const { data: subscription } = useSubscription();
  // A cancelled plan whose period has ended is not current, so the user can
  // subscribe again even if the expiry webhook has not removed the row yet.
  const isCurrent = isWanderer(subscription);

  const handleCheckout = () => {
    if (isCurrent) return;
    closeUpgradeModal();
    void startCheckout("wanderer");
  };

  return (
    <Dialog
      open={showUpgradeModal}
      onOpenChange={(open) => !open && closeUpgradeModal()}
    >
      <DialogContent className={cn(pinDropContentClass, "sm:max-w-[620px]")}>
        <PinDropHero mood="key" scene="upgrade" size="compact" />
        <DialogHeader className="px-6 pb-4 text-left">
          <DialogTitle className={popupTitleClass}>Upgrade to Wanderer</DialogTitle>
          <DialogDescription className={popupTextClass}>
            Compare the Free plan with the Wanderer plan.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 max-h-[72vh] overflow-y-auto">
          <div className="flex items-end justify-between gap-4 pb-5">
            <p className="text-sm font-medium text-foreground">Wanderer</p>
            <div className="flex items-baseline gap-1 shrink-0">
              {PLAN_CONFIG.wanderer.originalPriceMonthly && (
                <span className="text-lg text-muted-foreground line-through mr-1">
                  ${PLAN_CONFIG.wanderer.originalPriceMonthly}
                </span>
              )}
              <span className="text-3xl font-medium tracking-tight">
                ${PLAN_CONFIG.wanderer.priceMonthly}
              </span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
          </div>
          {PLAN_CONFIG.wanderer.originalPriceMonthly && (
            <p className="text-xs font-medium text-primary -mt-3 pb-4 text-right">
              Limited-time discount
            </p>
          )}

          <div className="rounded-xl border border-border/50 overflow-hidden bg-secondary/10">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_120px_170px] items-center px-4 py-2.5 bg-secondary/30 border-b border-border/40 text-[11px] font-medium text-muted-foreground">
              <span>Feature</span>
              <span>Free plan</span>
              <span className="text-primary">Wanderer plan</span>
            </div>

            {BENEFITS.map(({ label, free, paid, icon: Icon }, index) => (
              <div
                key={label}
                className={`grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_120px_170px] gap-x-3 gap-y-2 items-center px-4 py-3.5 ${index > 0 ? "border-t border-border/30" : ""}`}
              >
                <div className="col-span-2 sm:col-span-1 flex items-center gap-2.5 min-w-0">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/60 border border-border/30 shrink-0">
                    <Icon size={14} className="text-muted-foreground" />
                  </span>
                  <span className="text-xs font-medium text-foreground">{label}</span>
                </div>

                <div className="text-xs text-muted-foreground">
                  <span className="block sm:hidden text-[10px] font-medium text-muted-foreground/70 mb-0.5">
                    Free plan
                  </span>
                  {free}
                </div>

                <div className="text-xs font-medium text-foreground">
                  <span className="block sm:hidden text-[10px] font-medium text-primary mb-0.5">
                    Wanderer plan
                  </span>
                  <span className="inline-flex items-start gap-1.5">
                    <Check size={13} className="text-primary shrink-0 mt-0.5" />
                    {paid}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <Button
              className="w-full h-11 rounded-lg font-medium"
              disabled={isCurrent}
              onClick={handleCheckout}
            >
              <Crown size={15} />
              {isCurrent ? "Current plan" : "Subscribe to Wanderer"}
            </Button>
            {!isCurrent && (
              <p className="text-[11px] text-muted-foreground text-center mt-2.5 leading-relaxed">
                Renews at ${PLAN_CONFIG.wanderer.priceMonthly} each month until you cancel. You can cancel anytime in Account Settings.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
