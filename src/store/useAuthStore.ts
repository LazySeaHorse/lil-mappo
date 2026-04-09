import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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

  // Internal
  _initialized: boolean;

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

  signOut: () => Promise<void>;

  /** Call once on app mount to hydrate session and subscribe to auth changes. */
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

  _initialized: false,

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

  signOut: async () => {
    await supabase.auth.signOut();
    // State cleared by onAuthStateChange listener
  },

  initAuth: () => {
    if (get()._initialized) return () => {};
    set({ _initialized: true });

    // Hydrate from existing session (handles magic link redirects / page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({
        session,
        user: session?.user ? toAuthUser(session.user) : null,
        isLoading: false,
      });
    });

    // Subscribe to future auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ? toAuthUser(session.user) : null,
        isLoading: false,
        // Auto-close auth modal when sign-in succeeds
        showAuthModal: session ? false : get().showAuthModal,
      });
    });

    // Return cleanup function
    return () => subscription.unsubscribe();
  },
}));
