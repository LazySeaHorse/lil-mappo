import { Loader2, Search, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { SEARCH_TERMS } from '@/lib/terms';

interface SearchFieldActionsProps {
  /** Whether the box has text. */
  hasText: boolean;
  loading: boolean;
  /** Empties the box. */
  onClear: () => void;
  className?: string;
}

/**
 * The icon inside every search field. An empty box shows a magnifying glass (not a button).
 * A box with text shows only an X that empties it. While a search loads, a spinner takes the
 * place of the magnifying glass, or sits next to the X so the user can still clear the box.
 * Search starts from the field itself (Enter, because each Mapbox search costs money; the
 * boundary search also runs while the user types), so there is no search button.
 * Place it in a `relative` wrapper around the input; the input uses `SEARCH_INPUT_CLASS`
 * for the room on the right.
 */
export const SearchFieldActions = ({ hasText, loading, onClear, className = '' }: SearchFieldActionsProps) => (
  <div className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center ${className}`}>
    {loading && <Loader2 size={13} aria-hidden="true" className="animate-spin text-primary opacity-70" />}
    {hasText ? (
      <IconButton
        type="button"
        variant="ghost"
        size="xs"
        onClick={onClear}
        aria-label={SEARCH_TERMS.clear}
        title={SEARCH_TERMS.clear}
        className="h-6 w-6 rounded-full"
      >
        <X size={12} />
      </IconButton>
    ) : (
      !loading && <Search size={13} aria-hidden="true" className="pointer-events-none mx-1 text-muted-foreground" />
    )}
  </div>
);
