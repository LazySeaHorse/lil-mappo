import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Mounts the Supabase auth listener exactly once for the lifetime of the app.
 * Placing this in the component tree (rather than using a store-internal guard)
 * means React's useEffect cleanup correctly tears down and re-establishes the
 * subscription in Strict Mode dev double-invocation.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    const cleanup = initAuth();
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
