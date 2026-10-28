/**
 * AnnotationAddDropdown — replaces CalloutAddDropdown.
 *
 * Choosing a place (a search result or a point picked on the map) previews a callout
 * there: it is staged (see `sceneItems`), so the map draws it as the video will, but it
 * is not on the timeline yet. The panel sets its style, title, subtitle and accent
 * color; choosing another place moves it. Add callout puts it on the timeline at the
 * playhead, selects it and closes the panel; closing the panel drops the preview.
 */

import { useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapPicker } from '@/hooks/useMapPicker';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Flag, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createCalloutItem, DEFAULT_CALLOUT_STYLE_ID, moveCalloutPatch, switchCalloutStyle } from '@/store/itemFactories';
import type { CalloutItem } from '@/store/types';
import { getStyle } from '@/annotations/registry';
import { StylePicker } from '@/annotations/inspector/StylePicker';
import { ContentFields } from '@/annotations/inspector/ContentFields';
import { accentControls, accentSettings } from '@/annotations/accent';
import { ColorRow } from '@/components/Inspector/controls/ColorRow';
import { SearchField } from '@/components/Search/SearchField';
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { Field } from '@/components/ui/field';
import { isPlacedPoint, placeLabel } from '@/engine/routeMode';
import { stagedItemsOf, type StagingOwner } from '@/engine/stagedItems';
import { ACCENT_TERMS, CALLOUT_ADD_TERMS } from '@/lib/terms';

const STAGING: StagingOwner = 'callout-add';

/** Shows a callout in the panel's preview; `play` plays its entrance again. */
function stage(item: CalloutItem, { play = false } = {}) {
  const { stageItems, playAppearPreview } = useProjectStore.getState();
  stageItems(STAGING, [item]);
  if (play) playAppearPreview([item.id]);
}

export const AnnotationAddDropdown = ({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const frame = useFrameOnMap();

  // The callout being previewed, before it is added.
  const draft = useProjectStore((s) => {
    const [item] = stagedItemsOf(s, STAGING);
    return item?.kind === 'callout' ? item : null;
  });

  // Closing the panel, or leaving the editor, drops the preview.
  useEffect(() => {
    if (!isOpen) useProjectStore.getState().clearStagedItems(STAGING);
  }, [isOpen]);
  useEffect(() => () => useProjectStore.getState().clearStagedItems(STAGING), []);

  /** Previews a callout at a point, or moves the one previewed. A name says which place it is and becomes the title. */
  const placeAt = (lngLat: [number, number], name: string) => {
    // Clearing the search reports the unset point: nothing to place.
    if (!isPlacedPoint(lngLat)) return;
    const item = draft
      ? { ...draft, ...moveCalloutPatch(draft, lngLat, name) }
      : createCalloutItem({
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
    stage(item, { play: true });
    frame.frameCallout(item);
  };

  const { isPicking, toggle: handleTogglePick } = useMapPicker('callout-new', {
    prompt: 'Callout',
    enabled: isOpen,
    // A map click names no place: its label is only the coordinates.
    onPick: (result) => placeAt(result.lngLat, ''),
  });

  const edit = (patch: Partial<CalloutItem>, options?: { play?: boolean }) => {
    if (draft) stage({ ...draft, ...patch }, options);
  };

  const handleAdd = () => {
    const [added] = useProjectStore.getState().addStagedItems(STAGING);
    if (!added) return;
    useProjectStore.getState().selectItem(added.id);
    onOpenChange(false);
  };

  const style = draft ? getStyle(draft.styleId) : undefined;
  const accents = accentControls(style?.controls ?? []);
  const lngLat = draft?.binding.kind === 'geographic' ? draft.binding.lngLat : null;

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

  const footer = (
    <Button variant={draft ? 'default' : 'secondary'} onClick={handleAdd} disabled={!draft} className="w-full">
      <Plus size={16} /> {CALLOUT_ADD_TERMS.add}
    </Button>
  );

  return (
    <ToolbarDropdownPanel
      open={isOpen}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={header}
      footer={footer}
    >
      <div className="space-y-2" data-walkthrough="callout-action">
        <SearchField
          label={CALLOUT_ADD_TERMS.search}
          value={lngLat ?? [0, 0]}
          name={draft && lngLat ? placeLabel(draft.locationName, lngLat) : ''}
          onSelect={placeAt}
          isPicking={isPicking}
          onStartPick={handleTogglePick}
        />
        <p className="px-1 text-xs text-muted-foreground">{CALLOUT_ADD_TERMS.approximate}</p>
      </div>

      {draft && (
        <div className="space-y-4">
          <StylePicker
            value={draft.styleId}
            title={draft.content.title}
            onChange={(styleId) => {
              const patch = switchCalloutStyle(draft, styleId);
              if (patch) edit(patch, { play: true });
            }}
          />

          <Field label={CALLOUT_ADD_TERMS.title} className="mb-0">
            <Input
              value={draft.content.title}
              // Like a rename in the inspector, the title stops following the place.
              onChange={(e) => edit({ content: { ...draft.content, title: e.target.value }, linkTitleToLocation: false })}
              placeholder={CALLOUT_ADD_TERMS.titlePlaceholder}
              aria-label={CALLOUT_ADD_TERMS.title}
              className="h-9 text-xs"
            />
          </Field>

          <ContentFields
            content={draft.content}
            slots={(style?.contentSlots ?? []).filter((slot) => slot === 'subtitle')}
            onChange={(content) => edit({ content })}
          />

          {accents.length > 0 && (
            <ColorRow
              label={ACCENT_TERMS.accent}
              value={(draft.settings[accents[0].key] as string) || '#000000'}
              onChange={(color) => edit({ settings: { ...draft.settings, ...accentSettings(accents, color) } })}
            />
          )}

          <p className="px-1 text-xs text-muted-foreground">{CALLOUT_ADD_TERMS.moreNote}</p>
        </div>
      )}
    </ToolbarDropdownPanel>
  );
};
