import { MapPin } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { SEARCH_TERMS } from '@/lib/terms';

/** The button next to a place search field. It lets the user click a place on the map. */
export const PickOnMapButton = ({ isPicking, onClick }: { isPicking: boolean; onClick: () => void }) => (
  <IconButton
    type="button"
    variant="ghost"
    size="sm"
    className={`h-8 w-8 shrink-0 rounded-lg transition-all ${isPicking ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
    onClick={onClick}
    title={SEARCH_TERMS.pickOnMap}
    aria-label={SEARCH_TERMS.pickOnMap}
    aria-pressed={isPicking}
  >
    <MapPin size={14} />
  </IconButton>
);
