import React from "react";
import {
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Subscription, CreditBalance } from "@/lib/database.types";
import { useCancelSubscription } from "@/hooks/useCancelSubscription";
import {
  Crown,
  Loader2,
  ChevronLeft,
  Coins,
  Zap,
  Clock,
  AlertTriangle,
  Timer,
  Sparkles,
} from "lucide-react";

interface ManageSubscriptionViewProps {
  subscription: Subscription | null;
  credits: CreditBalance | null;
  tierLabel: string | null;
  renewalDate: string | null;
  hasRecurring: boolean;
  accessToken: string | null;
  onBack: () => void;
  onRefetch: () => void;
  onOpenUpgrade: () => void;
}

export function ManageSubscriptionView({
  subscription,
  credits,
  tierLabel,
  renewalDate,
  hasRecurring,
  accessToken,
  onBack,
  onRefetch,
  onOpenUpgrade,
}: ManageSubscriptionViewProps) {
  const { cancelling, confirmCancel, setConfirmCancel, justCancelled, handleCancel } =
    useCancelSubscription({ accessToken, renewalDate, onSuccess: onRefetch });

  // Covers both "was already cancelled/cancelling when modal opened" and
  // "user just cancelled during this session" (optimistic update).
  const isCancelled =
    justCancelled ||
    subscription?.status === "cancelled" ||
    subscription?.status === "cancelling";

  const totalCredits =
    (credits?.monthly_credits ?? 0) + (credits?.purchased_credits ?? 0);

  const canUpgrade = subscription?.tier !== "pioneer";

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="p-6 pb-2 bg-gradient-to-b from-secondary/30 to-transparent flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <DialogTitle className="text-xl font-medium tracking-tight">
            Manage plan
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs mt-0.5">
            {tierLabel ?? "No active plan"}
          </DialogDescription>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-6 pb-6 pt-4 max-h-[70vh] overflow-y-auto">
        {/* Status card */}
        <div className="bg-secondary/30 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground/80">Status</p>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                isCancelled
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              }`}
            >
              {subscription?.status === "cancelled"
                ? "Cancelled"
                : isCancelled
                ? "Cancelling"
                : "Active"}
            </span>
          </div>

          {subscription?.tier && (
            <AccountInfoRow label="Plan" value={tierLabel ?? subscription.tier} />
          )}

          {subscription?.status === "cancelled" && renewalDate ? (
            <AccountInfoRow label="Access until" value={renewalDate} />
          ) : isCancelled && renewalDate ? (
            <AccountInfoRow label="Cancels on" value={renewalDate} />
          ) : renewalDate ? (
            <AccountInfoRow label="Renews" value={renewalDate} />
          ) : null}
        </div>

        {/* Credit balance */}
        <div>
          <AccountSectionHeading icon={<Coins size={14} />} label="Credits" />
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-medium tabular-nums">
                {totalCredits.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground font-medium">
                credits available
              </span>
            </div>
            <p className="text-[11px] font-medium text-primary flex items-center gap-1 -mt-1 mb-1">
              <Timer size={11} /> About {(totalCredits / 8).toLocaleString()} minutes at 1080p
            </p>
            <div className="flex flex-wrap gap-2">
              {(credits?.monthly_credits ?? 0) > 0 && (
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Clock size={10} /> {credits!.monthly_credits.toLocaleString()} monthly credits
                </span>
              )}
              {(credits?.purchased_credits ?? 0) > 0 && (
                <span className="text-xs bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Zap size={10} /> {credits!.purchased_credits.toLocaleString()} purchased credits
                </span>
              )}
              {totalCredits === 0 && (
                <span className="text-xs text-muted-foreground">No credits</span>
              )}
            </div>
            {credits?.monthly_reset_date && (
              <p className="text-[11px] text-muted-foreground">
                Monthly credits reset on{" "}
                {new Date(credits.monthly_reset_date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        {/* Upgrade options (if not on Pioneer) */}
        {canUpgrade && (
          <div>
            <AccountSectionHeading icon={<Sparkles size={14} />} label="Plans" />
            <Button
              variant="outline"
              className="w-full rounded-lg gap-2 h-11 text-xs font-medium bg-secondary/20 hover:bg-secondary/40 border-border/40"
              onClick={onOpenUpgrade}
            >
              <Crown size={14} className="text-primary" />
              Change plan
            </Button>
          </div>
        )}

        {/* Cancel section (only for active recurring subscriptions) */}
        {hasRecurring && !isCancelled && (
          <div>
            <AccountSectionHeading
              icon={<AlertTriangle size={14} />}
              label="Cancel subscription"
            />
            {confirmCancel ? (
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    size={15}
                    className="text-destructive shrink-0 mt-0.5"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Cancel plan?</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      You can use the plan until{" "}
                      <span className="font-medium text-foreground">
                        {renewalDate ?? "the end of your billing period"}
                      </span>
                      . After that date, you cannot create cloud projects. Existing
                      cloud projects remain available.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="text-xs h-8 rounded-lg px-4"
                    onClick={handleCancel}
                    disabled={cancelling}
                  >
                    {cancelling ? (
                      <>
                        <Loader2 size={12} className="animate-spin mr-1.5" />
                        Cancelling
                      </>
                    ) : (
                      "Cancel plan"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 rounded-lg px-4"
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelling}
                  >
                    Keep plan
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-secondary/20 rounded-xl p-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The plan ends at the end of the current billing period.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 rounded-lg px-3 shrink-0 text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel plan
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Cancelled confirmation */}
        {isCancelled && renewalDate && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your plan ends on <span className="font-medium text-foreground">{renewalDate}</span>.
              After that date, you cannot create cloud projects. Existing cloud
              projects remain available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function AccountSectionHeading({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="text-muted-foreground/60 p-1.5 bg-secondary/50 rounded-md border border-border/30 shadow-sm">
        {icon}
      </span>
      <h3 className="text-xs font-medium text-foreground/80">{label}</h3>
    </div>
  );
}

export function AccountInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium truncate max-w-[200px]">{value}</span>
    </div>
  );
}
