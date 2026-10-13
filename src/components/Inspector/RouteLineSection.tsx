import type { RouteItem } from '@/store/types';
import { ColorRow, SliderRow, SwitchRow, VisualCardSelect, type VisualCardOption } from './InspectorShared';
import { InspectorSection } from './InspectorSection';

type RouteLineStyle = 'solid' | 'dashed' | 'dotted';

const LINE_STYLES = [
  { value: 'solid', label: 'Solid', icon: <div className="w-5 h-[2.5px] bg-current rounded-full my-0.5" /> },
  { value: 'dashed', label: 'Dashed', icon: <div className="w-5 border-t-[2.5px] border-dashed border-current my-0.5" /> },
  { value: 'dotted', label: 'Dotted', icon: <div className="w-5 border-t-[2.5px] border-dotted border-current my-0.5" /> },
] as const satisfies readonly VisualCardOption<RouteLineStyle>[];

const DASH_PATTERNS: Record<RouteLineStyle, number[] | null> = { solid: null, dashed: [8, 4], dotted: [2, 4] };

function lineStyleOf(style: RouteItem['style']): RouteLineStyle {
  if (!style.dashPattern) return 'solid';
  return style.dashPattern[0] === 2 ? 'dotted' : 'dashed';
}

/** How the line looks: color, width, dash and glow. */
export function RouteLineSection({
  style,
  onStyle,
}: {
  style: RouteItem['style'];
  onStyle: (patch: Partial<RouteItem['style']>) => void;
}) {
  return (
    <InspectorSection kind="route" id="line">
      <ColorRow label="Color" value={style.color} onChange={(color) => onStyle({ color })} />

      <SliderRow label="Width" value={style.width} onChange={(width) => onStyle({ width })} min={1} max={15} step={1} unit="px" />

      <div className="flex flex-col gap-1.5 pt-0.5">
        <span className="text-xs font-medium text-muted-foreground">Line style</span>
        <VisualCardSelect
          options={LINE_STYLES}
          value={lineStyleOf(style)}
          onChange={(v) => onStyle({ dashPattern: DASH_PATTERNS[v] })}
          columns={3}
        />
      </div>

      <SwitchRow label="Glow" checked={style.glow} onChange={(glow) => onStyle({ glow })} />

      {style.glow && (
        <SliderRow
          label="Glow width"
          value={style.glowWidth}
          onChange={(glowWidth) => onStyle({ glowWidth })}
          min={2}
          max={40}
          step={1}
          unit="px"
        />
      )}
    </InspectorSection>
  );
}
