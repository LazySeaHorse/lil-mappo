import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/useAuthStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useCredits } from "@/hooks/useCredits";
import { TIER_LABELS } from "@/lib/database.types";
import {
  Key,
  Crown,
  User,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  ChevronLeft,
  Coins,
  Zap,
  Clock,
  AlertTriangle,
  Timer,
  Sparkles,
} from "lucide-react";
import { BYOK_STORAGE_KEY, isAppOwnKey } from "@/config/mapbox";
import { PremiumUpsellCard } from "./PremiumUpsellCard";
import secureLocalStorage from "react-secure-storage";

// ─── Shell ────────────────────────────────────────────────────────────────────

export function AccountSettingsModal() {
  const { showSettingsModal, closeSettingsModal } = useAuthStore();

  return (
    <Dialog
      open={showSettingsModal}
      onOpenChange={(open) => !open && closeSettingsModal()}
    >
      <DialogContent className="sm:max-w-[720px] rounded-3xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden">
        {showSettingsModal && <AccountSettingsModalBody />}
      </DialogContent>
    </Dialog>
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

type View = "main" | "manage";

function AccountSettingsModalBody() {
  const { user, closeSettingsModal, openAuthModal, session, startCheckout, openCreditsModal } =
    useAuthStore();
  const { data: subscription, isLoading: subLoading, refetch: refetchSub } =
    useSubscription();
  const { data: credits } = useCredits();
  const [view, setView] = useState<View>("main");
  const [mapboxToken, setMapboxToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    const token = secureLocalStorage.getItem(BYOK_STORAGE_KEY);
    setMapboxToken(typeof token === "string" ? token : "");
  }, []);

  const handleSaveToken = () => {
    const trimmed = mapboxToken.trim();
    setTokenError(null);

    if (trimmed) {
      if (isAppOwnKey(trimmed)) {
        setTokenError("This key isn't valid for BYOK — please use your own Mapbox access token.");
        return;
      }
      secureLocalStorage.setItem(BYOK_STORAGE_KEY, trimmed);
    } else {
      secureLocalStorage.removeItem(BYOK_STORAGE_KEY);
    }
    setTokenSaved(true);
    // Reload so the new token takes effect for Mapbox map initialisation
    setTimeout(() => window.location.reload(), 800);
  };

  const handleClearToken = () => {
    secureLocalStorage.removeItem(BYOK_STORAGE_KEY);
    setMapboxToken("");
    setTokenSaved(false);
    setTokenError(null);
    // Reload so the app reverts to the built-in token
    setTimeout(() => window.location.reload(), 400);
  };

  const tierSlug = subscription?.tier ?? null;
  const tierLabel = tierSlug ? (TIER_LABELS[tierSlug] ?? tierSlug) : null;
  const hasSubscription = !!subscription;
  // Nomad has a subscription row but no dodo_subscription_id (credit pack only)
  const hasRecurring = !!subscription?.dodo_subscription_id;
  const renewalDate = subscription?.renewal_date
    ? new Date(subscription.renewal_date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    : null;

  // ── Manage sub-view ────────────────────────────────────────────────────────
  if (view === "manage") {
    return (
      <ManageView
        subscription={subscription ?? null}
        credits={credits ?? null}
        tierLabel={tierLabel}
        renewalDate={renewalDate}
        hasRecurring={hasRecurring}
        accessToken={session?.access_token ?? null}
        onBack={() => setView("main")}
        onRefetch={() => refetchSub()}
        onOpenCredits={() => {
          closeSettingsModal();
          openCreditsModal();
        }}
      />
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <div className="p-6 pb-2 bg-gradient-to-b from-secondary/30 to-transparent">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
            <User className="text-primary h-5 w-5" /> Settings
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm mt-1">
            Account preferences and advanced integrations.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="flex flex-col gap-8 px-6 pb-6 pt-4 max-h-[70vh] overflow-y-auto">
        {/* ─── Account Info ─── */}
        <section>
          <SectionHeading icon={<User size={14} />} label="Account" />
          {user ? (
            <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
              <InfoRow label="Email" value={user.email} />
              {user.displayName && (
                <InfoRow label="Name" value={user.displayName} />
              )}
            </div>
          ) : (
            <div className="bg-secondary/30 rounded-xl p-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Sign in to unlock cloud features.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 rounded-lg px-3 shrink-0"
                onClick={() => {
                  closeSettingsModal();
                  openAuthModal();
                }}
              >
                Sign In
              </Button>
            </div>
          )}
        </section>

        {/* ─── Subscription ─── */}
        <section>
          <SectionHeading icon={<Crown size={14} />} label="Subscription" />
          {hasSubscription ? (
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {tierLabel ?? "No plan"}
                  </p>
                  {(subscription?.status === "cancelled" || subscription?.status === "cancelling") && renewalDate ? (
                    <p className="text-[11px] text-amber-500">
                      {subscription.status === "cancelling" ? `Cancels ${renewalDate}` : `Access until ${renewalDate}`}
                    </p>
                  ) : renewalDate ? (
                    <p className="text-[11px] text-muted-foreground">
                      Renews {renewalDate}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {hasSubscription ? "Credit pack" : "No active plan"}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 rounded-lg px-4"
                  onClick={() => setView("manage")}
                >
                  Manage
                </Button>
              </div>
            </div>
          ) : (
            <PremiumUpsellCard
              onClick={() => {
                closeSettingsModal();
                openCreditsModal();
              }}
            />
          )}
        </section>

        {/* ─── BYOK ─── */}
        <section>
          <SectionHeading
            icon={<Key size={14} />}
            label="Mapbox API Key (BYOK)"
          />
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Paste your own Mapbox access token to lift the 30s timeline limit and
              export quality cap. Your token is stored
              locally and{" "}
              <span className="font-medium text-foreground">
                never sent to our servers
              </span>
              .{" "}
              <a
                href="https://mapbox.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                You can get one for free at mapbox.com <ExternalLink size={10} />
              </a>
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="pk.eyJ1Ijo..."
                value={mapboxToken}
                onChange={(e) => {
                  setMapboxToken(e.target.value);
                  setTokenSaved(false);
                  setTokenError(null);
                }}
                className={`h-9 rounded-lg bg-background/50 border-border/50 text-xs font-mono placeholder:text-muted-foreground/40 flex-1 ${tokenError ? "border-destructive" : ""}`}
              />
              <Button
                size="sm"
                variant={tokenSaved ? "default" : "outline"}
                className="h-9 rounded-lg px-3 text-xs font-semibold shrink-0 min-w-[64px] transition-all"
                onClick={handleSaveToken}
                disabled={tokenSaved}
              >
                {tokenSaved ? (
                  <>
                    <Check size={14} className="mr-1" />
                    Reloading…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
            {tokenError && (
              <p className="text-xs text-destructive flex items-start gap-1.5">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                {tokenError}
              </p>
            )}
            {!!mapboxToken.trim() && !tokenSaved && !tokenError && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-destructive hover:text-destructive px-2"
                onClick={handleClearToken}
              >
                Remove token
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Manage sub-view ──────────────────────────────────────────────────────────

import type { Subscription, CreditBalance } from "@/lib/database.types";
import { useCancelSubscription } from "@/hooks/useCancelSubscription";

function ManageView({
  subscription,
  credits,
  tierLabel,
  renewalDate,
  hasRecurring,
  accessToken,
  onBack,
  onRefetch,
  onUpgrade,
}: {
  subscription: Subscription | null;
  credits: CreditBalance | null;
  tierLabel: string | null;
  renewalDate: string | null;
  hasRecurring: boolean;
  accessToken: string | null;
  onBack: () => void;
  onRefetch: () => void;
  onOpenCredits: () => void;
}) {
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

  const canUpgrade =
    subscription?.tier !== "pioneer";

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
          <DialogTitle className="text-xl font-black tracking-tight">
            Manage Subscription
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs mt-0.5">
            {tierLabel ?? "No active plan"}
          </DialogDescription>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-6 pb-6 pt-4 max-h-[70vh] overflow-y-auto">

        {/* ── Status card ── */}
        <div className="bg-secondary/30 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
              Status
            </p>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isCancelled
                ? "bg-amber-500/10 text-amber-500"
                : "bg-green-500/10 text-green-500"
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
            <InfoRow label="Plan" value={tierLabel ?? subscription.tier} />
          )}

          {subscription?.status === "cancelled" && renewalDate ? (
            <InfoRow label="Access until" value={renewalDate} />
          ) : isCancelled && renewalDate ? (
            <InfoRow label="Cancels on" value={renewalDate} />
          ) : renewalDate ? (
            <InfoRow label="Renews" value={renewalDate} />
          ) : null}
        </div>

        {/* ── Credit balance ── */}
        <div>
          <SectionHeading icon={<Coins size={14} />} label="Credits" />
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black tabular-nums">
                {totalCredits.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground font-medium">
                total credits
              </span>
            </div>
            <p className="text-[11px] font-bold text-primary flex items-center gap-1 -mt-1 mb-1">
              <Timer size={11} /> ~{(totalCredits / 8).toLocaleString()} mins of 1080p
            </p>
            <div className="flex flex-wrap gap-2">
              {(credits?.monthly_credits ?? 0) > 0 && (
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                  <Clock size={10} /> {credits!.monthly_credits.toLocaleString()} monthly
                </span>
              )}
              {(credits?.purchased_credits ?? 0) > 0 && (
                <span className="text-xs bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                  <Zap size={10} /> {credits!.purchased_credits.toLocaleString()} purchased (never expire)
                </span>
              )}
              {totalCredits === 0 && (
                <span className="text-xs text-muted-foreground">
                  No credits available
                </span>
              )}
            </div>
            {credits?.monthly_reset_date && (
              <p className="text-[11px] text-muted-foreground">
                Monthly credits reset on{" "}
                {new Date(credits.monthly_reset_date).toLocaleDateString(
                  "en-US",
                  { month: "long", day: "numeric" }
                )}
              </p>
            )}
          </div>
        </div>

        {/* ── Upgrade options (if not on Pioneer) ── */}
        {canUpgrade && (
          <div>
            <SectionHeading icon={<Sparkles size={14} />} label="Plans" />
            <Button
              variant="outline"
              className="w-full rounded-xl gap-2 h-11 text-xs font-semibold bg-secondary/20 hover:bg-secondary/40 border-border/40"
              onClick={onOpenCredits}
            >
              <Crown size={14} className="text-primary" />
              Upgrade or Change Plan
            </Button>
          </div>
        )}

        {/* ── Cancel section (only for active recurring subscriptions) ── */}
        {hasRecurring && !isCancelled && (
          <div>
            <SectionHeading
              icon={<AlertTriangle size={14} />}
              label="Cancel Subscription"
            />
            {confirmCancel ? (
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    size={15}
                    className="text-destructive shrink-0 mt-0.5"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Are you sure?</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      You'll keep access until{" "}
                      <span className="font-medium text-foreground">
                        {renewalDate ?? "the end of your billing period"}
                      </span>
                      . After that, cloud saves will be locked — your existing
                      saves stay safe, but you won't be able to create new ones.
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
                        Cancelling…
                      </>
                    ) : (
                      "Yes, cancel"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 rounded-lg px-4"
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelling}
                  >
                    Never mind
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-secondary/20 rounded-xl p-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Cancel your subscription at the end of the current billing
                  period.
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
              Your subscription is cancelled. You have full access until{" "}
              <span className="font-medium text-foreground">{renewalDate}</span>
              . Existing cloud saves will remain after that date, but no new
              cloud saves can be created.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function SectionHeading({
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
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
        {label}
      </h3>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium truncate max-w-[200px]">{value}</span>
    </div>
  );
}
