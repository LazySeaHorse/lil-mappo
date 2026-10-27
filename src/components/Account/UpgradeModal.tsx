import React from "react";
import { PinDropHero } from "@/components/ui/pin-drop";
import {
  CalendarClock,
  Check,
  Cloud,
  Crown,
  Film,
  Gauge,
  RefreshCw,
  ShieldCheck,
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
import { PASS_PLAN, PLAN_CONFIG } from "@/services/checkout";
import { useAuthStore } from "@/store/useAuthStore";
import { useShallow } from "zustand/react/shallow";
import {
  FREE_CLOUD_SAVE_LIMIT,
  FREE_LIMITS,
  activePassEnd,
  hasActiveSubscription,
} from "@/lib/cloudAccess";
import { PRO_PASS_DAYS, PRO_PASS_PRICE, formatPassEnd } from "@/lib/proPass";

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
  // A Pro pass is not a subscription: pass holders can still subscribe.
  const isCurrent = hasActiveSubscription(subscription);
  const passEnd = activePassEnd(subscription);

  const handleCheckout = () => {
    if (isCurrent) return;
    closeUpgradeModal();
    void startCheckout("wanderer");
  };

  const handlePassCheckout = () => {
    if (isCurrent) return;
    closeUpgradeModal();
    void startCheckout(PASS_PLAN);
  };

  return (
    <Dialog
      open={showUpgradeModal}
      onOpenChange={(open) => !open && closeUpgradeModal()}
    >
      <DialogContent size="lg">
        <PinDropHero mood="key" scene="upgrade" size="compact" />
        <DialogHeader className="px-6 pb-4 text-left">
          <DialogTitle>Upgrade to Wanderer</DialogTitle>
          <DialogDescription>
            Compare the Free plan with the Wanderer plan.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 max-h-[72vh] overflow-y-auto">
          <div className="rounded-xl border border-border/50 overflow-hidden bg-secondary/10">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_120px_170px] items-center px-4 py-2.5 bg-secondary/30 border-b border-border/40 text-2xs font-medium text-muted-foreground">
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
                  <span className="block sm:hidden text-2xs font-medium text-muted-foreground/70 mb-0.5">
                    Free plan
                  </span>
                  {free}
                </div>

                <div className="text-xs font-medium text-foreground">
                  <span className="block sm:hidden text-2xs font-medium text-primary mb-0.5">
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
            {isCurrent ? (
              <Button size="xl" className="w-full" disabled>
                <Crown size={15} />
                Current plan
              </Button>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    size="xl"
                    className="w-full"
                    onClick={handleCheckout}
                    aria-label={`Subscribe to Wanderer, $${PLAN_CONFIG.wanderer.priceMonthly}/month`}
                  >
                    <Crown size={15} />
                    {PLAN_CONFIG.wanderer.originalPriceMonthly && (
                      <>
                        <span className="line-through opacity-60">
                          ${PLAN_CONFIG.wanderer.originalPriceMonthly}
                        </span>{" "}
                      </>
                    )}
                    ${PLAN_CONFIG.wanderer.priceMonthly}/month
                  </Button>
                  <Button
                    variant="outline"
                    size="xl"
                    className="w-full"
                    onClick={handlePassCheckout}
                    aria-label={
                      passEnd
                        ? `Add ${PRO_PASS_DAYS} days for $${PRO_PASS_PRICE}`
                        : `${PRO_PASS_DAYS}-day pass, $${PRO_PASS_PRICE} for ${PRO_PASS_DAYS} days`
                    }
                  >
                    <CalendarClock size={15} />
                    {passEnd
                      ? `Add ${PRO_PASS_DAYS} days`
                      : `$${PRO_PASS_PRICE} for ${PRO_PASS_DAYS} days`}
                  </Button>
                </div>
                <p className="text-2xs text-muted-foreground text-center mt-2.5 leading-relaxed">
                  {passEnd
                    ? `Your pass ends ${formatPassEnd(passEnd)}. Monthly renews at $${PLAN_CONFIG.wanderer.priceMonthly} until you cancel in Account Settings. Adding a pass extends it by ${PRO_PASS_DAYS} days.`
                    : `Monthly renews at $${PLAN_CONFIG.wanderer.priceMonthly} until you cancel in Account Settings. The pass is one payment of $${PRO_PASS_PRICE} for ${PRO_PASS_DAYS} days of everything in Wanderer, no renewal.`}
                </p>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
