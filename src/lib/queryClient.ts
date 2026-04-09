import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient — shared between App.tsx (provider) and
 * useAuthStore (for cache invalidation after checkout fulfillment).
 */
export const queryClient = new QueryClient();
