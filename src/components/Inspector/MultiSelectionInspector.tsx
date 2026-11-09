import type { ReactNode } from 'react';
import { Box, Layers, MapPin, Navigation, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { CalloutConnectorSection } from '@/annotations/inspector/CalloutConnectorSection';
import { DynamicControls } from '@/annotations/inspector/DynamicControls';
import { SizeControls } from '@/annotations/inspector/SizeControls';
import { StylePicker } from '@/annotations/inspector/StylePicker';
import { getStyle } from '@/annotations/registry';
import type { TransitionConfig } from '@/annotations/types';
import { MULTI_SELECT_TERMS, STYLE_TERMS } from '@/lib/terms';
import { undo } from '@/store/history';
import { switchCalloutStyle } from '@/store/itemFactories';
import type { BoundaryItem, CalloutItem, CameraItem, ModelItem, RouteItem, TimelineItem } from '@/store/types';
import { useProjectStore } from '@/store/useProjectStore';
import { BoundaryAnimationSection, BoundaryAppearanceSection } from './BoundaryStyleSections';
import { PanelWrapper } from './InspectorLayout';
import { InspectorSection } from './InspectorSection';
import { ModelSizeSlider } from './ModelSizeSlider';
import { RouteAnimationSection } from './RouteAnimationSection';
import { RouteLineSection } from './RouteLineSection';
import { mergeValues } from './mergeValues';
import { TimingBehaviour } from './timing/TimingBehaviour';
import { boundaryTiming, calloutTiming, modelTiming, routeTiming, type TimingAdapter } from './timing/timingAdapters';

type Clip = Exclude<TimelineItem, CameraItem>;
type UpdateEach<T> = (patchFor: (item: T) => Partial<T> | null) => void;

/** One store write, so a whole edit is one undo step; each clip's patch is built from that clip, and null leaves it alone. */
function useUpdateEach<T extends Clip>(items: readonly T[]): UpdateEach<T> {
  const updateItems = useProjectStore((s) => s.updateItems);
  return (patchFor) => {
    const updates = items.flatMap((item) => {
      const patch = patchFor(item);
      return patch ? [[item.id, patch] as const] : [];
    });
    if (updates.length > 0) updateItems(Object.fromEntries(updates));
  };
}

/**
 * Motion and enter/exit, without start and end: setting one time on every clip would stack them.
 * A field only some of the clips have (a route that does not draw has no "when it ends") is left out.
 */
function BulkTimingSection<T extends Clip>({
  adapter,
  items,
  updateEach,
}: {
  adapter: TimingAdapter<T>;
  items: readonly T[];
  updateEach: UpdateEach<T>;
}) {
  const models = items.map(adapter.read);
  const { value, mixed } = mergeValues(models);
  const transition = mergeValues<TransitionConfig>(models.flatMap((model) => (model.transition ? [model.transition] : [])));
  const everyClipEnds = models.every((model) => model.whenItEnds !== undefined);
  return (
    <InspectorSection kind={adapter.panel} id="timing">
      <div className="flex flex-col gap-2.5">
        <TimingBehaviour
          adapter={adapter}
          model={everyClipEnds ? value : { ...value, whenItEnds: undefined }}
          write={(patch) => updateEach((item) => adapter.write(item, patch))}
          mixed={{ fields: mixed, transition: transition.mixed }}
        />
      </div>
    </InspectorSection>
  );
}

function RouteSections({ items }: { items: readonly RouteItem[] }) {
  const updateEach = useUpdateEach(items);
  const { value: style, mixed } = mergeValues(items.map((route) => route.style));
  const onStyle = (patch: Partial<RouteItem['style']>) => updateEach((route) => ({ style: { ...route.style, ...patch } }));
  return (
    <>
      <RouteLineSection style={style} onStyle={onStyle} mixed={mixed} />
      <RouteAnimationSection style={style} onStyle={onStyle} mixed={mixed} />
      <BulkTimingSection adapter={routeTiming} items={items} updateEach={updateEach} />
    </>
  );
}

function BoundarySections({ items }: { items: readonly BoundaryItem[] }) {
  const updateEach = useUpdateEach(items);
  const { value: style, mixed } = mergeValues(items.map((area) => area.style));
  const onStyle = (patch: Partial<BoundaryItem['style']>) => updateEach((area) => ({ style: { ...area.style, ...patch } }));
  return (
    <>
      <BoundaryAppearanceSection style={style} onStyle={onStyle} mixed={mixed} />
      <BoundaryAnimationSection style={style} onStyle={onStyle} mixed={mixed} />
      <BulkTimingSection adapter={boundaryTiming} items={items} updateEach={updateEach} />
    </>
  );
}

function CalloutSections({ items }: { items: readonly CalloutItem[] }) {
  const updateEach = useUpdateEach(items);
  const style = getStyle(items[0].styleId);
  // A style's own controls only make sense while every callout has that style.
  const sameStyle = items.every((callout) => callout.styleId === items[0].styleId);
  const changeStyle = (styleId: string) => {
    // Each callout carries over its own settings; one already in this style is left as it is.
    updateEach((callout) => switchCalloutStyle(callout, styleId));
    toast(STYLE_TERMS.changed, { action: { label: STYLE_TERMS.undo, onClick: () => { undo(); } } });
  };
  const settings = mergeValues(items.map((callout) => callout.settings));
  const size = mergeValues(items.map(({ scale, sizeMode, referenceZoom }) => ({ scale, sizeMode, referenceZoom })));
  const connector = mergeValues(items.map((callout) => callout.connector));
  const everyHasConnector = items.every((callout) => {
    const calloutStyle = getStyle(callout.styleId);
    return calloutStyle?.supportsAltitude !== false && !calloutStyle?.drawsConnector;
  });
  return (
    <>
      <InspectorSection kind="callout" id="style">
        <StylePicker value={sameStyle ? items[0].styleId : null} onChange={changeStyle} />
      </InspectorSection>
      {sameStyle && style && style.controls.length > 0 && (
        <InspectorSection kind="callout" id="appearance">
          <DynamicControls
            controls={style.controls}
            settings={settings.value}
            mixed={settings.mixed}
            onUpdate={(changes) => updateEach((callout) => ({ settings: { ...callout.settings, ...changes } }))}
          />
        </InspectorSection>
      )}
      <InspectorSection kind="callout" id="size">
        <SizeControls item={size.value} mixed={size.mixed} onChange={(patch) => updateEach(() => patch)} />
      </InspectorSection>
      {everyHasConnector && (
        <CalloutConnectorSection
          connector={connector.value}
          mixed={connector.mixed}
          onChange={(patch) => updateEach((callout) => ({ connector: { ...callout.connector, ...patch } }))}
        />
      )}
      <BulkTimingSection adapter={calloutTiming} items={items} updateEach={updateEach} />
    </>
  );
}

function ModelSections({ items }: { items: readonly ModelItem[] }) {
  const updateEach = useUpdateEach(items);
  const { value, mixed } = mergeValues(items.map(({ scale }) => ({ scale })));
  return (
    <>
      <InspectorSection kind="model" id="size">
        <ModelSizeSlider value={value.scale} mixed={mixed.has('scale')} onChange={(scale) => updateEach(() => ({ scale }))} />
      </InspectorSection>
      <BulkTimingSection adapter={modelTiming} items={items} updateEach={updateEach} />
    </>
  );
}

function allOfKind<K extends Clip['kind']>(items: readonly TimelineItem[], kind: K): items is readonly Extract<Clip, { kind: K }>[] {
  return items.every((item) => item.kind === kind);
}

function sameKindPanel(items: readonly TimelineItem[]): { kind: Clip['kind']; icon: ReactNode; sections: ReactNode } | null {
  if (allOfKind(items, 'route')) return { kind: 'route', icon: <Navigation size={15} />, sections: <RouteSections items={items} /> };
  if (allOfKind(items, 'boundary')) return { kind: 'boundary', icon: <Shield size={15} />, sections: <BoundarySections items={items} /> };
  if (allOfKind(items, 'callout')) return { kind: 'callout', icon: <MapPin size={15} />, sections: <CalloutSections items={items} /> };
  if (allOfKind(items, 'model')) return { kind: 'model', icon: <Box size={15} />, sections: <ModelSections items={items} /> };
  return null;
}

/**
 * Panel while several clips are selected. Clips of one kind edit together: a change goes to every
 * one of them and touches only that setting. What is specific to one clip (its path, place, text
 * and times) stays in its own panel. Clips of different kinds share too little to edit together.
 */
export function MultiSelectionInspector({ items }: { items: readonly TimelineItem[] }) {
  const panel = sameKindPanel(items);
  if (panel) {
    return (
      <PanelWrapper title={`${items.length} ${MULTI_SELECT_TERMS.countOf[panel.kind]}`} icon={panel.icon}>
        {panel.sections}
      </PanelWrapper>
    );
  }
  return (
    <PanelWrapper title={MULTI_SELECT_TERMS.mixedKindsTitle(items.length)} icon={<Layers size={15} />}>
      <p className="text-sm text-muted-foreground leading-relaxed" data-ph-unmask>
        {MULTI_SELECT_TERMS.mixedKindsBody}
      </p>
    </PanelWrapper>
  );
}
