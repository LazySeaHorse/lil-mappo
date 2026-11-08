import { Ban, Layers, PenLine, Sparkles } from 'lucide-react';
import type { BoundaryItem } from '@/store/types';
import { CountryCutoutFeature } from '@/components/FeatureVotes/CountryCutoutFeature';
import { Field } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { BOUNDARY_ANIMATION_LABELS, BOUNDARY_TERMS } from '@/lib/terms';
import { FlagPicker } from './FlagPicker';
import { ColorRow, MixedTag, SliderRow, SwitchRow, VisualCardSelect, type VisualCardOption } from './InspectorShared';
import { InspectorSection } from './InspectorSection';
import { formatPercent } from './inspectorValues';
import type { MixedFields } from './mergeValues';

type BoundaryStyle = BoundaryItem['style'];
type BoundaryAnimationMode = 'none' | BoundaryStyle['animationStyle'];

interface BoundaryStyleSectionProps {
  style: BoundaryStyle;
  onStyle: (patch: Partial<BoundaryStyle>) => void;
  /** Set while several areas are edited together: the fields on which they differ. */
  mixed?: MixedFields<BoundaryStyle>;
}

const ANIMATION_OPTIONS = [
  { value: 'none', label: BOUNDARY_ANIMATION_LABELS.none, icon: <Ban size={13} /> },
  { value: 'fade', label: BOUNDARY_ANIMATION_LABELS.fade, icon: <Layers size={13} /> },
  { value: 'draw', label: BOUNDARY_ANIMATION_LABELS.draw, icon: <PenLine size={13} /> },
  { value: 'trace', label: BOUNDARY_ANIMATION_LABELS.trace, icon: <Sparkles size={13} /> },
] as const satisfies readonly VisualCardOption<BoundaryAnimationMode>[];

/** Border, fill and mask of an area. */
export function BoundaryAppearanceSection({ style, onStyle, mixed }: BoundaryStyleSectionProps) {
  const fillModeMixed = mixed?.has('fillMode') ?? false;
  const fillsWithColor = !fillModeMixed && style.fillMode !== 'flag';
  // A flag belongs to one place, so it is only picked for a single area.
  const picksFlag = !mixed && style.fillMode === 'flag';

  return (
    <InspectorSection kind="boundary" id="appearance">
      <div className="flex flex-col gap-3">
        <ColorRow
          label={BOUNDARY_TERMS.borderColor}
          value={style.strokeColor}
          onChange={(strokeColor) => onStyle({ strokeColor })}
          mixed={mixed?.has('strokeColor')}
        />

        <SliderRow
          label={BOUNDARY_TERMS.borderWidth}
          value={style.strokeWidth}
          onChange={(strokeWidth) => onStyle({ strokeWidth })}
          min={1}
          max={15}
          step={1}
          unit="px"
          mixed={mixed?.has('strokeWidth')}
        />

        <SwitchRow label="Glow" checked={style.glow} onChange={(glow) => onStyle({ glow })} mixed={mixed?.has('glow')} />

        <Field label={<span className="flex items-center gap-1.5">{BOUNDARY_TERMS.fill}{fillModeMixed && <MixedTag />}</span>}>
          <SegmentedControl
            options={[{ value: 'color', label: 'Color' }, { value: 'flag', label: 'Flag' }]}
            value={fillModeMixed ? null : style.fillMode}
            onValueChange={(fillMode) => onStyle({ fillMode })}
          />
        </Field>

        {picksFlag && (
          <div className="flex flex-col gap-1.5">
            <FlagPicker value={style.flagCode} onChange={(flagCode) => onStyle({ flagCode })} />
            {!style.flagCode && (
              <span className="text-2xs text-muted-foreground leading-tight">
                Select a country to show its flag inside the boundary.
              </span>
            )}
          </div>
        )}

        {fillsWithColor && (
          <ColorRow
            label={BOUNDARY_TERMS.fillColor}
            value={style.fillColor}
            onChange={(fillColor) => onStyle({ fillColor })}
            mixed={mixed?.has('fillColor')}
          />
        )}

        <SliderRow
          label={BOUNDARY_TERMS.fillOpacity}
          value={style.fillOpacity}
          onChange={(fillOpacity) => onStyle({ fillOpacity })}
          min={0}
          max={1}
          step={0.01}
          formatValue={formatPercent}
          mixed={mixed?.has('fillOpacity')}
        />

        {fillsWithColor && (
          <SwitchRow
            label="Keep roads visible"
            sublabel="Streets show through the fill"
            checked={style.fillUnderRoads}
            onChange={(fillUnderRoads) => onStyle({ fillUnderRoads })}
            mixed={mixed?.has('fillUnderRoads')}
          />
        )}

        {!mixed && <CountryCutoutFeature />}

        <SwitchRow
          label="Mask outside"
          sublabel="Cover the map area outside the boundary"
          checked={style.maskOutside}
          onChange={(maskOutside) => onStyle({ maskOutside })}
          mixed={mixed?.has('maskOutside')}
        />

        {style.maskOutside && !mixed?.has('maskOutside') && (
          <div className="flex flex-col gap-3 pl-2 border-l-2 border-primary/20">
            <ColorRow
              label="Mask color"
              value={style.maskColor}
              onChange={(maskColor) => onStyle({ maskColor })}
              mixed={mixed?.has('maskColor')}
            />
            <SliderRow
              label="Mask opacity"
              value={style.maskOpacity}
              onChange={(maskOpacity) => onStyle({ maskOpacity })}
              min={0}
              max={1}
              step={0.01}
              formatValue={formatPercent}
              mixed={mixed?.has('maskOpacity')}
            />
          </div>
        )}
      </div>
    </InspectorSection>
  );
}

/** How an area's border appears over time. */
export function BoundaryAnimationSection({ style, onStyle, mixed }: BoundaryStyleSectionProps) {
  // Areas that all have no animation agree, whatever animation each would use if it had one.
  const modeMixed = (mixed?.has('animateStroke') || (style.animateStroke && mixed?.has('animationStyle'))) ?? false;
  const mode: BoundaryAnimationMode | null = modeMixed ? null : style.animateStroke ? style.animationStyle : 'none';

  const changeMode = (next: BoundaryAnimationMode) => {
    onStyle(next === 'none' ? { animateStroke: false } : { animateStroke: true, animationStyle: next });
  };

  return (
    <InspectorSection kind="boundary" id="animation">
      <div className="flex flex-col gap-3">
        <VisualCardSelect options={ANIMATION_OPTIONS} value={mode} onChange={changeMode} columns={4} />

        {mode === 'trace' && (
          <SliderRow
            label={BOUNDARY_TERMS.highlightLength}
            hint={BOUNDARY_TERMS.highlightHint}
            endLabels={BOUNDARY_TERMS.highlightEnds}
            value={style.traceLength}
            onChange={(traceLength) => onStyle({ traceLength })}
            min={0.01}
            max={0.5}
            step={0.01}
            // The value is the part of the outline that is lit: 0.1 is 10 %.
            formatValue={formatPercent}
            mixed={mixed?.has('traceLength')}
          />
        )}
      </div>
    </InspectorSection>
  );
}
