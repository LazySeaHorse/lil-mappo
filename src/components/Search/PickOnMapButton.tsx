import { MapPin } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { SEARCH_TERMS } from '@/lib/terms';

/** The button next to a place search field. It lets the user click a place on the map. */
export const PickOnMapButton = ({ isPicking, onClick }: { isPicking: boolean; onClick: () => void }) => (
  <IconButton
    type="button"
    variant={isPicking ? 'selected' : 'ghost'}
    size="sm"
    className="shrink-0"
    onClick={onClick}
    title={SEARCH_TERMS.pickOnMap}
    aria-label={SEARCH_TERMS.pickOnMap}
    aria-pressed={isPicking}
  >
    <MapPin size={14} />
  </IconButton>
);
