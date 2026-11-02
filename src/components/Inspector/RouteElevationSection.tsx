import { useId } from 'react';
import type { RouteItem } from '@/store/types';
import { useProjectStore } from '@/store/useProjectStore';
import { InspectorSection } from './InspectorSection';
import { routeElevationProfile } from './routeElevation';

const CHART_W = 100;
const CHART_H = 40;

const metres = (value: number) => `${Math.round(value).toLocaleString()} m`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      <span className="text-2xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/** The route's altitude along its length, with the playhead's place on it. Shown only for a route that has altitude. */
export function RouteElevationSection({ item }: { item: RouteItem }) {
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const gradientId = useId();
  const profile = routeElevationProfile(item);
  if (!profile) return null;

  const { elevations, min, max, gain } = profile;
  const last = elevations.length - 1;
  const range = Math.max(1, max - min);
  const xAt = (i: number) => (i / last) * CHART_W;
  const yAt = (ele: number) => CHART_H - ((ele - min) / range) * CHART_H;

  const line = elevations.map((ele, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(ele).toFixed(2)}`).join(' ');
  const area = `${line} L${CHART_W},${CHART_H} L0,${CHART_H} Z`;

  const progress = Math.min(1, Math.max(0, (playheadTime - item.startTime) / Math.max(0.1, item.endTime - item.startTime)));
  const nowIdx = Math.round(progress * last);
  const nowLeft = (xAt(nowIdx) / CHART_W) * 100;
  const nowTop = (yAt(elevations[nowIdx]) / CHART_H) * 100;

  return (
    <InspectorSection kind="route" id="elevation">
      <div className="flex gap-3">
        <Stat label="Gain" value={`+${metres(gain)}`} />
        <Stat label="Highest" value={metres(max)} />
        <Stat label="At playhead" value={metres(elevations[nowIdx])} />
      </div>
      <div
        role="img"
        aria-label={`Elevation from ${metres(min)} to ${metres(max)}, ${metres(elevations[nowIdx])} at the playhead`}
        className="relative h-20 rounded-lg border border-border/40 bg-background/50"
      >
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="absolute inset-x-0 inset-y-2 h-[calc(100%-1rem)] w-full overflow-visible text-primary">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 inset-y-2">
          <span className="absolute inset-y-0 w-px bg-primary/40" style={{ left: `${nowLeft}%` }} />
          <span
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
            style={{ left: `${nowLeft}%`, top: `${nowTop}%` }}
          />
        </div>
        <span className="absolute left-2 top-1 text-2xs tabular-nums text-muted-foreground">{metres(max)}</span>
      </div>
    </InspectorSection>
  );
}
