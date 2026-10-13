import type { RouteItem } from '@/store/types';
import { ROUTE_ANIMATION_TERMS } from '@/lib/terms';
import { SliderRow, SwitchRow, VisualCardSelect, type VisualCardOption } from './InspectorShared';
import { InspectorSection } from './InspectorSection';
import { RouteAnimationPreview } from './RouteAnimationPreview';

type RouteAnimationType = RouteItem['style']['animationType'];

const ANIMATION_OPTIONS = (['draw', 'navigation', 'comet'] as const).map((value) => ({
  value,
  label: ROUTE_ANIMATION_TERMS[value].label,
  preview: <RouteAnimationPreview type={value} />,
})) satisfies readonly VisualCardOption<RouteAnimationType>[];

/** How the line appears over time, and the options of the chosen animation. */
export function RouteAnimationSection({
  style,
  onStyle,
}: {
  style: RouteItem['style'];
  onStyle: (patch: Partial<RouteItem['style']>) => void;
}) {
  const type = style.animationType;

  return (
    <InspectorSection kind="route" id="animation">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{ROUTE_ANIMATION_TERMS.label}</span>
        <VisualCardSelect
          options={ANIMATION_OPTIONS}
          value={type}
          onChange={(animationType) => onStyle({ animationType })}
          columns={3}
        />
        <p className="text-[11px] leading-tight text-muted-foreground">{ROUTE_ANIMATION_TERMS[type].hint}</p>
      </div>

      {type === 'comet' && (
        <SliderRow
          label="Trail length"
          value={style.cometTrailLength}
          onChange={(cometTrailLength) => onStyle({ cometTrailLength })}
          min={0.05}
          max={0.8}
          step={0.05}
          formatValue={(v) => v.toFixed(2)}
        />
      )}

      {type === 'draw' && (
        <div className="flex flex-col gap-2">
          <SwitchRow label="Fade trail" checked={style.trailFade} onChange={(trailFade) => onStyle({ trailFade })} />
          {style.trailFade && (
            <SliderRow
              label="Fade length"
              value={style.trailFadeLength}
              onChange={(trailFadeLength) => onStyle({ trailFadeLength })}
              min={0.05}
              max={1}
              step={0.05}
              formatValue={(v) => v.toFixed(2)}
            />
          )}
        </div>
      )}
    </InspectorSection>
  );
}
