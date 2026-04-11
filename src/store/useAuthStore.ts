import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  type PlanSlug,
  type SubscriptionPlan,
  initiateDodoCheckout,
  storePendingPlan,
  getPendingPlan,
  clearPendingPlan,
  storePendingTopup,
  getPendingTopup,
  clearPendingTopup,
} from "@/services/checkout";
import { queryClient } from "@/lib/queryClient";
import { toast } from "sonner";

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    displayName:
      user.user_metadata?.full_name || user.user_metadata?.name || undefined,
    avatarUrl:
      user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      undefined,
  };
}

interface AuthStore {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;

  // Modal visibility
  showAuthModal: boolean;
  /** 'signin' = sign-in only flow; 'signup' = account creation during checkout */
  authModalMode: "signin" | "signup";
  showSettingsModal: boolean;
  showCreditsModal: boolean;
  showRendersModal: boolean;

  // Actions
  setUser: (user: AuthUser | null) => void;
  setSession: (session: Session | null) => void;
  setIsLoading: (v: boolean) => void;

  openAuthModal: () => void;
  /** Opens the auth modal in signup mode (used by the checkout flow). */
  openSignupModal: () => void;
  closeAuthModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openCreditsModal: () => void;
  closeCreditsModal: () => void;
  openRendersModal: () => void;
  closeRendersModal: () => void;

  /**
   * Initiates checkout for the given plan.
   *
   * - Signed in  → creates a Dodo session and redirects immediately.
   * - Not signed in → stores the pending plan in localStorage and opens
   *   the AuthModal. After sign-in the SIGNED_IN handler in initAuth()
   *   picks it up and triggers the redirect automatically.
   *
   * @param quantity Only relevant for 'topup'. Equals the slider value in dollars.
   */
  startCheckout: (plan: PlanSlug, quantity?: number) => Promise<void>;

  signOut: () => Promise<void>;

  /** Called by AuthProvider on mount. Returns a cleanup function. */
  initAuth: () => () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,

  showAuthModal: false,
  authModalMode: "signin",
  showSettingsModal: false,
  showCreditsModal: false,
  showRendersModal: false,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setIsLoading: (v) => set({ isLoading: v }),

  openAuthModal: () => set({ showAuthModal: true, authModalMode: "signin" }),
  openSignupModal: () => set({ showAuthModal: true, authModalMode: "signup" }),
  closeAuthModal: () => set({ showAuthModal: false }),
  openSettingsModal: () => set({ showSettingsModal: true }),
  closeSettingsModal: () => set({ showSettingsModal: false }),
  openCreditsModal: () => set({ showCreditsModal: true }),
  closeCreditsModal: () => set({ showCreditsModal: false }),
  openRendersModal: () => set({ showRendersModal: true }),
  closeRendersModal: () => set({ showRendersModal: false }),

  startCheckout: async (plan: PlanSlug, quantity?: number) => {
    const { user, session, openSignupModal } = get();

    if (!user || !session) {
      // Not signed in — persist the intent so the SIGNED_IN handler can resume
      // checkout after the user creates an account.
      if (plan === "topup") {
        storePendingTopup(quantity ?? 10);
      } else {
        storePendingPlan(plan as SubscriptionPlan);
      }
      openSignupModal();
      return;
    }

    const toastId = "checkout-loading";
    toast.loading("Preparing checkout…", { id: toastId });

    try {
      await initiateDodoCheckout(plan, session.access_token, { quantity });
      // initiateDodoCheckout either navigates away (never returns) or throws.
      // Reaching here is unexpected — dismiss the toast defensively.
      toast.dismiss(toastId);
    } catch (err: unknown) {
      toast.dismiss(toastId);
      const message =
        err instanceof Error
          ? err.message
          : "Could not start checkout. Please try again.";
      toast.error(message);
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // State is cleared by the onAuthStateChange listener below
  },

  initAuth: () => {
    // Hydrate from an existing session (handles magic-link redirects on page load)
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({
        session,
        user: session?.user ? toAuthUser(session.user) : null,
        isLoading: false,
      });
    });

    // Subscribe to future auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      set({
        session,
        user: session?.user ? toAuthUser(session.user) : null,
        isLoading: false,
        // Auto-close auth modal on successful sign-in
        showAuthModal: session ? false : get().showAuthModal,
      });

      if (event === "SIGNED_IN" && session) {
        // Resume any pending checkout that was stored before authentication.
        const pendingPlan = getPendingPlan();
        const pendingTopup = getPendingTopup();

        if (pendingPlan) {
          clearPendingPlan();
          const toastId = "checkout-loading";
          toast.loading("Preparing checkout…", { id: toastId });
          initiateDodoCheckout(pendingPlan, session.access_token).catch(
            (err: unknown) => {
              toast.dismiss(toastId);
              const message =
                err instanceof Error
                  ? err.message
                  : "Could not start checkout. Please try again.";
              toast.error(message);
            },
          );
          // On success, window.location.href is set — no need to dismiss toast.
        } else if (pendingTopup !== null) {
          clearPendingTopup();
          const toastId = "checkout-loading";
          toast.loading("Preparing checkout…", { id: toastId });
          initiateDodoCheckout("topup", session.access_token, {
            quantity: pendingTopup,
          }).catch((err: unknown) => {
            toast.dismiss(toastId);
            const message =
              err instanceof Error
                ? err.message
                : "Could not start checkout. Please try again.";
            toast.error(message);
          });
        }

        // Always refresh subscription + credit data after sign-in so modals
        // show live state (covers both normal sign-in and checkout return).
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
        queryClient.invalidateQueries({ queryKey: ["credit_balance"] });
      }
    });

    return () => subscription.unsubscribe();
  },
}));
