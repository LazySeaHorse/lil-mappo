import { Scissors } from 'lucide-react';
import { UpcomingFeatureRow } from './UpcomingFeature';

/** Shared request beside the boundary fill controls, before and after adding an area. */
export function CountryCutoutFeature({ onOpen }: { onOpen?: () => void }) {
  return (
    <UpcomingFeatureRow
      featureId="country-cutouts"
      icon={<Scissors size={18} />}
      hint="Transparent video · Not built yet"
      onOpen={onOpen}
    />
  );
}
