import { create } from 'zustand';
import type { UpcomingFeatureId } from '@/config/upcomingFeatures';

interface HostState {
  /** The feature the dialog shows; kept after closing so the dialog fades out with its content. */
  featureId: UpcomingFeatureId | null;
  open: boolean;
}

export const useFeatureVoteHostState = create<HostState>(() => ({ featureId: null, open: false }));

/** Opens a feature's vote dialog from somewhere that closes itself on the click, like a menu or popover. */
export function openFeatureVote(featureId: UpcomingFeatureId): void {
  useFeatureVoteHostState.setState({ featureId, open: true });
}
