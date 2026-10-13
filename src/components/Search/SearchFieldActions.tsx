import { Search, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

interface SearchFieldActionsProps {
  onSearch: () => void;
  loading: boolean;
  /** Shows a clear button next to the search button. */
  onClear?: () => void;
  className?: string;
}

/**
 * The buttons inside every search field. Search starts only on Enter (each search
 * costs money), so the search button shows that and does the same as Enter.
 * Place it in a `relative` wrapper around the input and leave room for it on the right.
 */
export const SearchFieldActions = ({ onSearch, loading, onClear, className = '' }: SearchFieldActionsProps) => (
  <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center ${className}`}>
    {onClear && (
      <IconButton
        type="button"
        variant="ghost"
        size="xs"
        onClick={onClear}
        aria-label="Clear"
        title="Clear"
        className="h-6 w-6 rounded-full"
      >
        <X size={11} />
      </IconButton>
    )}
    <IconButton
      type="button"
      variant="ghost"
      size="xs"
      onClick={onSearch}
      disabled={loading}
      loading={loading}
      aria-label="Search"
      title="Search (Enter)"
      className="h-6 w-6 hover:text-primary"
    >
      <Search size={13} />
    </IconButton>
  </div>
);
