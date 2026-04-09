import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fulfillPendingCheckout, type PlanSlug } from '@/services/mockCheckout';
import { queryClient } from '@/lib/queryClient';
import { toast } from 'sonner';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      undefined,
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
  showSettingsModal: boolean;
  showCreditsModal: boolean;
  showRendersModal: boolean;
  showCheckoutModal: boolean;
  checkoutPlan: PlanSlug | null;

  // Actions
  setUser: (user: AuthUser | null) => void;
  setSession: (session: Session | null) => void;
  setIsLoading: (v: boolean) => void;

  openAuthModal: () => void;
  closeAuthModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openCreditsModal: () => void;
  closeCreditsModal: () => void;
  openRendersModal: () => void;
  closeRendersModal: () => void;

  /** Open the checkout modal for a specific plan. */
  openCheckoutModal: (plan: PlanSlug) => void;
  closeCheckoutModal: () => void;

  signOut: () => Promise<void>;

  /** Called by AuthProvider on mount. Returns a cleanup function. */
  initAuth: () => () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,

  showAuthModal: false,
  showSettingsModal: false,
  showCreditsModal: false,
  showRendersModal: false,
  showCheckoutModal: false,
  checkoutPlan: null,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setIsLoading: (v) => set({ isLoading: v }),

  openAuthModal: () => set({ showAuthModal: true }),
  closeAuthModal: () => set({ showAuthModal: false }),
  openSettingsModal: () => set({ showSettingsModal: true }),
  closeSettingsModal: () => set({ showSettingsModal: false }),
  openCreditsModal: () => set({ showCreditsModal: true }),
  closeCreditsModal: () => set({ showCreditsModal: false }),
  openRendersModal: () => set({ showRendersModal: true }),
  closeRendersModal: () => set({ showRendersModal: false }),

  openCheckoutModal: (plan) => set({ showCheckoutModal: true, checkoutPlan: plan }),
  closeCheckoutModal: () => set({ showCheckoutModal: false, checkoutPlan: null }),

  signOut: async () => {
    await supabase.auth.signOut();
    // State cleared by onAuthStateChange listener
  },

  initAuth: () => {
    // Hydrate from existing session (handles magic link redirects / page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({
        session,
        user: session?.user ? toAuthUser(session.user) : null,
        isLoading: false,
      });
    });

    // Subscribe to future auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      set({
        session,
        user: session?.user ? toAuthUser(session.user) : null,
        isLoading: false,
        // Auto-close auth modal when sign-in succeeds
        showAuthModal: session ? false : get().showAuthModal,
      });

      // After a fresh sign-in, check if there's a pending checkout to fulfill
      if (event === 'SIGNED_IN' && session?.user) {
        fulfillPendingCheckout(session.user.id).then((fulfilledPlan) => {
          if (fulfilledPlan) {
            // Invalidate subscription + credits caches so modals show live data
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
            queryClient.invalidateQueries({ queryKey: ['credit_balance'] });
            toast.success(`Welcome to ${fulfilledPlan === 'cartographer' ? 'Cartographer' : 'Pioneer'}! Your account is active.`);
          }
        });
      }
    });

    return () => subscription.unsubscribe();
  },
}));
