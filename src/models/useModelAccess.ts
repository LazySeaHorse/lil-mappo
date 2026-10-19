import { useSubscription } from '@/hooks/useSubscription';
import { isWanderer } from '@/lib/cloudAccess';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Importing a 3D model is Pro (`isWanderer`, which also covers a Pro pass). Only the import is
 * gated: a project that already has models opens, plays and exports for everyone.
 */
export function useModelImportAccess(): { canImport: boolean; askToUpgrade: () => void } {
  const { data: subscription } = useSubscription();
  const openUpgradeModal = useAuthStore((s) => s.openUpgradeModal);
  return { canImport: isWanderer(subscription), askToUpgrade: () => openUpgradeModal('model_import') };
}
