import { FeatureVoteDialog } from './FeatureVoteDialog';
import { useFeatureVoteHostState } from './featureVoteHostState';

/** Shows the dialog `openFeatureVote` asks for. Mount once, outside any menu or popover. */
export function FeatureVoteHost() {
  const featureId = useFeatureVoteHostState((s) => s.featureId);
  const open = useFeatureVoteHostState((s) => s.open);
  if (!featureId) return null;
  return (
    <FeatureVoteDialog
      featureId={featureId}
      open={open}
      onOpenChange={(next) => useFeatureVoteHostState.setState({ open: next })}
    />
  );
}
