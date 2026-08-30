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
  ExternalLink,
} from "lucide-react";
import { BYOK_STORAGE_KEY, isAppOwnKey } from "@/config/mapbox";
import { PremiumUpsellCard } from "./PremiumUpsellCard";
import {
  ManageSubscriptionView,
  AccountSectionHeading,
  AccountInfoRow,
} from "./ManageSubscriptionView";
import secureLocalStorage from "react-secure-storage";

// ─── Shell ────────────────────────────────────────────────────────────────────

export function AccountSettingsModal() {
  const { showSettingsModal, closeSettingsModal } = useAuthStore();

  return (
    <Dialog
      open={showSettingsModal}
      onOpenChange={(open) => !open && closeSettingsModal()}
    >
      <DialogContent className="sm:max-w-[720px] rounded-2xl bg-background/95 border-border/40 shadow-2xl p-0 overflow-hidden">
        {showSettingsModal && <AccountSettingsModalBody />}
      </DialogContent>
    </Dialog>
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

type View = "main" | "manage";

function AccountSettingsModalBody() {
  const { user, closeSettingsModal, openAuthModal, session, openUpgradeModal } =
    useAuthStore();
  const { data: subscription, refetch: refetchSub } = useSubscription();
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
        setTokenError("This is the app token. Enter your own Mapbox access token.");
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
      <ManageSubscriptionView
        subscription={subscription ?? null}
        credits={credits ?? null}
        tierLabel={tierLabel}
        renewalDate={renewalDate}
        hasRecurring={hasRecurring}
        accessToken={session?.access_token ?? null}
        onBack={() => setView("main")}
        onRefetch={() => refetchSub()}
        onOpenUpgrade={() => {
          closeSettingsModal();
          openUpgradeModal();
        }}
      />
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <div className="p-6 pb-2 bg-gradient-to-b from-secondary/30 to-transparent">
        <DialogHeader>
          <DialogTitle className="text-2xl font-medium tracking-tight flex items-center gap-2">
            <User className="text-primary h-5 w-5" /> Settings
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm mt-1">
            Manage your account and Mapbox access token.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="flex flex-col gap-8 px-6 pb-6 pt-4 max-h-[70vh] overflow-y-auto">
        {/* ─── Account Info ─── */}
        <section>
          <AccountSectionHeading icon={<User size={14} />} label="Account" />
          {user ? (
            <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
              <AccountInfoRow label="Email" value={user.email} />
              {user.displayName && (
                <AccountInfoRow label="Name" value={user.displayName} />
              )}
            </div>
          ) : (
            <div className="bg-secondary/30 rounded-xl p-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Sign in to use cloud projects.
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
                Sign in
              </Button>
            </div>
          )}
        </section>

        {/* ─── Subscription ─── */}
        <section>
          <AccountSectionHeading icon={<Crown size={14} />} label="Subscription" />
          {hasSubscription ? (
            <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
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
                openUpgradeModal();
              }}
            />
          )}
        </section>

        {/* ─── BYOK ─── */}
        <section>
          <AccountSectionHeading
            icon={<Key size={14} />}
            label="Mapbox access token"
          />
          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Use your own Mapbox access token to remove free-plan export limits.
              The app stores the token on this device. It is{" "}
              <span className="font-medium text-foreground">not sent to our servers</span>.{" "}
              <a
                href="https://mapbox.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                Get a token from mapbox.com <ExternalLink size={10} />
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
                className="h-9 rounded-lg px-3 text-xs font-medium shrink-0 min-w-[64px] transition-all"
                onClick={handleSaveToken}
                disabled={tokenSaved}
              >
                {tokenSaved ? (
                  <>
                    <Check size={14} className="mr-1" />
                    Reloading
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
