import React from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';
import {
  BOUNDARY_DETAIL_LEVELS,
  SAMPLE_HEIGHT_M,
  SAMPLE_WIDTH_M,
  boundaryDetailSample,
  getBoundaryDetailLevel,
  type BoundaryDetailId,
} from '@/engine/boundaryDetail';

const THUMB_W = 40;
const THUMB_H = 24;
const PAD = 2;

/** Honest thumbnail: the shared sample coastline, simplified at this level's tolerance by the real simplifier. */
function DetailThumbnail({ id, active }: { id: BoundaryDetailId; active: boolean }) {
  const points = React.useMemo(() => {
    const sx = (THUMB_W - PAD * 2) / SAMPLE_WIDTH_M;
    const sy = (THUMB_H - PAD * 2) / SAMPLE_HEIGHT_M;
    return boundaryDetailSample(id)
      .map(([x, y]) => `${(PAD + x * sx).toFixed(1)},${(THUMB_H - PAD - y * sy).toFixed(1)}`)
      .join(' ');
  }, [id]);
  return (
    <svg
      width={THUMB_W}
      height={THUMB_H}
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      aria-hidden="true"
      data-testid={`boundary-detail-thumb-${id}`}
      className={cn('transition-colors', active ? 'text-primary' : 'text-muted-foreground/60')}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function BoundaryDetailPicker({
  value,
  onChange,
}: {
  value: BoundaryDetailId;
  onChange: (id: BoundaryDetailId) => void;
}) {
  const options = BOUNDARY_DETAIL_LEVELS.map((l) => ({
    value: l.id,
    label: l.label,
    title: `${l.label}: ${l.hint}`,
  }));
  return (
    <div className="space-y-2 px-1">
      <SegmentedControl options={options} value={value} onValueChange={onChange} />
      <div className="grid grid-cols-3" aria-hidden="true">
        {BOUNDARY_DETAIL_LEVELS.map((l) => (
          <div key={l.id} className="flex justify-center">
            <DetailThumbnail id={l.id} active={l.id === value} />
          </div>
        ))}
      </div>
      <p className="text-[11px] font-medium text-foreground/80">{getBoundaryDetailLevel(value).hint}</p>
      <p className="text-[10px] text-muted-foreground leading-snug">
        Can&apos;t be changed later. Lighter is faster with smaller files but less accurate up close.
      </p>
    </div>
  );
}
