import { MoreHorizontal, Copy, Trash2, SkipBack } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button';
import { ITEM_TYPE_LABELS, type InspectorItemKind } from '@/lib/terms';
import { EditableTitle } from './controls/EditableTitle';
import { useInspectorItemActions } from './useInspectorItemActions';

interface InspectorHeaderProps {
  kind: InspectorItemKind;
  id: string;
  name: string;
  /** When missing, the name is shown as plain text (camera views have no name to edit). */
  onRename?: (name: string) => void;
  /** Placeholder of the name field. */
  placeholder?: string;
  /** Where "Go to start" puts the playhead, in seconds. */
  startTime: number;
}

/**
 * Top of every item panel: the item name and a menu with Duplicate, Go to
 * start and Delete. Put it in `PanelWrapper`'s
 * `header` slot, so it also works in the phone drawer.
 */
export function InspectorHeader({ kind, id, name, onRename, placeholder, startTime }: InspectorHeaderProps) {
  const actions = useInspectorItemActions(kind, id, startTime);

  return (
    <div className="flex flex-1 min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1">
        {/* The panel type is for screen readers only; the name says enough on screen. */}
        <h2 className="sr-only">{ITEM_TYPE_LABELS[kind]}</h2>
        {onRename ? (
          <EditableTitle value={name} onChange={onRename} placeholder={placeholder} className="mb-0" />
        ) : (
          <p className="truncate px-1 text-sm font-medium text-foreground">{name}</p>
        )}
      </div>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <IconButton variant="ghost" size="sm" aria-label="Item actions" title="Item actions">
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 rounded-xl">
          <DropdownMenuItem onSelect={actions.duplicate} className="text-xs">
            <Copy size={13} /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={actions.goToStart} className="text-xs">
            <SkipBack size={13} /> Go to start
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={actions.remove} className="text-xs">
            <Trash2 size={13} /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
