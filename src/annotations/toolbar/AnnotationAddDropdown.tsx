/**
 * AnnotationAddDropdown — replaces CalloutAddDropdown.
 *
 * Choosing a place (a search result or a point picked on the map) adds a callout
 * there at once, selects it and brings all of it into view. The panel stays open
 * with a field to rename the callout just added; the next place adds another.
 * Style is chosen later in the inspector.
 */

import { useEffect, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapPicker } from '@/hooks/useMapPicker';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { Input } from '@/components/ui/input';
import { Flag } from 'lucide-react';
import { toast } from 'sonner';
import { createCalloutItem, DEFAULT_CALLOUT_STYLE_ID } from '@/store/itemFactories';
import { SearchField } from '@/components/Search/SearchField';
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { Field } from '@/components/ui/field';
import { isPlacedPoint } from '@/engine/routeMode';
import { CALLOUT_ADD_TERMS } from '@/lib/terms';

export const AnnotationAddDropdown = ({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const frame = useFrameOnMap();

  // The callout this panel added last, which the title field renames.
  const [addedId, setAddedId] = useState<string | null>(null);
  const added = useProjectStore((s) => {
    const item = addedId ? s.items[addedId] : undefined;
    return item?.kind === 'callout' ? item : null;
  });

  useEffect(() => {
    if (!isOpen) setAddedId(null);
  }, [isOpen]);

  /** Adds a callout at a point. A name says which place it is and becomes the title. */
  const addAt = (lngLat: [number, number], name: string) => {
    // Clearing the search reports the unset point: nothing to add.
    if (!isPlacedPoint(lngLat)) return;
    const item = createCalloutItem({
      styleId: DEFAULT_CALLOUT_STYLE_ID,
      content: { title: name || CALLOUT_ADD_TERMS.defaultTitle },
      lngLat,
      startTime: useProjectStore.getState().playheadTime,
      linkTitleToLocation: !!name,
      locationName: name,
    });
    if (!item) {
      toast.error('Invalid style selected');
      return;
    }
    const { addItem, selectItem } = useProjectStore.getState();
    addItem(item);
    selectItem(item.id);
    setAddedId(item.id);
    frame.frameCallout(item);
  };

  const { isPicking, toggle: handleTogglePick } = useMapPicker('callout-new', {
    prompt: 'Callout',
    enabled: isOpen,
    // A map click names no place: its label is only the coordinates.
    onPick: (result) => addAt(result.lngLat, ''),
  });

  /** Renames the callout just added. Like a rename in the inspector, the title stops following the place. */
  const rename = (title: string) => {
    if (!added) return;
    useProjectStore.getState().updateItem(added.id, { content: { ...added.content, title }, linkTitleToLocation: false });
  };

  const trigger = (
    <IconButton
      variant={isOpen ? "toolbar-active" : "toolbar"}
      size="sm"
      title="Add Callout"
      data-walkthrough="add-callout"
    >
      <Flag size={18} />
    </IconButton>
  );

  const header = (
    <PanelHeader
      icon={<Flag size={16} />}
      title="Add Callout"
      subtitle="Place a 3D label on the map"
    />
  );

  return (
    <ToolbarDropdownPanel
      open={isOpen}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={header}
    >
      <div className="space-y-2" data-walkthrough="callout-action">
        {/* A new field for each added callout, so the box is empty for the next place. */}
        <SearchField
          key={addedId ?? 'new'}
          label={CALLOUT_ADD_TERMS.search}
          value={[0, 0]}
          name=""
          onSelect={addAt}
          isPicking={isPicking}
          onStartPick={handleTogglePick}
        />
        <p className="px-1 text-xs text-muted-foreground">{CALLOUT_ADD_TERMS.approximate}</p>
      </div>

      {added && (
        <Field label={CALLOUT_ADD_TERMS.title} className="mb-0">
          <Input
            value={added.content.title}
            onChange={(e) => rename(e.target.value)}
            placeholder={CALLOUT_ADD_TERMS.titlePlaceholder}
            aria-label={CALLOUT_ADD_TERMS.title}
            className="h-9 text-xs"
          />
        </Field>
      )}

      <p className="px-1 text-xs text-muted-foreground">{CALLOUT_ADD_TERMS.styleNote}</p>
    </ToolbarDropdownPanel>
  );
};
