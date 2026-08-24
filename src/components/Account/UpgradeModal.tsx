import React from "react";
import {
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
import { PLAN_CONFIG } from "@/services/checkout";
import { useAuthStore } from "@/store/useAuthStore";

const BENEFITS = [
  {
    label: "Cloud projects",
    free: "3 projects",
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
    free: "720p, 30 FPS",
    paid: "Up to 4K, 60 FPS",
    icon: Film,
  },
  {
    label: "Maximum duration",
    free: "30 seconds",
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
  const { showUpgradeModal, closeUpgradeModal, startCheckout } = useAuthStore();
  const { data: subscription } = useSubscription();
  const isCurrent =
    subscription?.tier === "wanderer" &&
    (subscription.status === "active" || subscription.status === "cancelling");

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
      <DialogContent className="sm:max-w-[620px] rounded-2xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden">
        <div className="p-6 pb-4 bg-gradient-to-b from-secondary/40 to-transparent">
          <DialogHeader>
            <DialogTitle className="text-2xl font-medium tracking-tight flex items-center gap-2 pr-8">
              <Crown className="text-primary h-5 w-5" /> Upgrade to Wanderer
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Compare the Free plan with the Wanderer plan.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 max-h-[72vh] overflow-y-auto">
          <div className="flex items-end justify-between gap-4 pb-5">
            <p className="text-sm font-medium text-foreground">Wanderer</p>
            <div className="flex items-baseline gap-1 shrink-0">
              <span className="text-3xl font-medium tracking-tight">
                ${PLAN_CONFIG.wanderer.priceMonthly}
              </span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
          </div>

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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
