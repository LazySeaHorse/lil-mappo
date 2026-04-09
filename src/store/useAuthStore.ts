import { create } from 'zustand';

/**
 * Auth state for Supabase user sessions.
 * Phase 1: Mock implementation (user is always null).
 * Phase 2: Wire to real Supabase onAuthStateChange.
 */

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

interface AuthStore {
  user: AuthUser | null;
  isLoading: boolean;

  // Modal visibility (managed here to allow any component to trigger auth)
  showAuthModal: boolean;
  showSettingsModal: boolean;
  showCreditsModal: boolean;
  showRendersModal: boolean;

  // Actions
  setUser: (user: AuthUser | null) => void;
  setIsLoading: (v: boolean) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openCreditsModal: () => void;
  closeCreditsModal: () => void;
  openRendersModal: () => void;
  closeRendersModal: () => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: false,

  showAuthModal: false,
  showSettingsModal: false,
  showCreditsModal: false,
  showRendersModal: false,

  setUser: (user) => set({ user }),
  setIsLoading: (v) => set({ isLoading: v }),

  openAuthModal: () => set({ showAuthModal: true }),
  closeAuthModal: () => set({ showAuthModal: false }),

  openSettingsModal: () => set({ showSettingsModal: true }),
  closeSettingsModal: () => set({ showSettingsModal: false }),

  openCreditsModal: () => set({ showCreditsModal: true }),
  closeCreditsModal: () => set({ showCreditsModal: false }),

  openRendersModal: () => set({ showRendersModal: true }),
  closeRendersModal: () => set({ showRendersModal: false }),

  // Phase 1: just clear user state. Phase 2: call supabase.auth.signOut()
  signOut: () => set({ user: null }),
}));
