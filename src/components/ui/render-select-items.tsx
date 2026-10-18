import React from 'react';
import { SelectItem } from '@/components/ui/select';
import { ProBadge } from '@/components/ui/pro-badge';
import { RESOLUTION_LABELS, type ExportResolution } from '@/types/render';
import type { ExportLimits } from '@/lib/cloudAccess';

const RESOLUTION_ORDER: ExportResolution[] = ['480p', '720p', '1080p', '1440p', '2160p'];

interface ItemsProps {
  limits: ExportLimits;
  /** Let Pro options be picked (still badged), where picking one offers the upgrade instead of being blocked. */
  lockedSelectable?: boolean;
}

export function ResolutionSelectItems({ limits, lockedSelectable = false }: ItemsProps) {
  return (
    <>
      {RESOLUTION_ORDER.map((r) => {
        const isLocked = limits.limited && RESOLUTION_ORDER.indexOf(r) > RESOLUTION_ORDER.indexOf(limits.maxResolution);
        return (
          <SelectItem key={r} value={r} disabled={isLocked && !lockedSelectable}>
            <div className="flex items-center gap-1.5">
              {RESOLUTION_LABELS[r]}
              {isLocked && <ProBadge />}
            </div>
          </SelectItem>
        );
      })}
    </>
  );
}

export function FpsSelectItems({ limits, showUnit = false, lockedSelectable = false }: ItemsProps & { showUnit?: boolean }) {
  return (
    <>
      <SelectItem value="30">{showUnit ? '30 FPS' : '30'}</SelectItem>
      <SelectItem value="60" disabled={limits.maxFps < 60 && !lockedSelectable}>
        <div className="flex items-center gap-1.5">
          {showUnit ? '60 FPS' : '60'}
          {limits.maxFps < 60 && <ProBadge />}
        </div>
      </SelectItem>
    </>
  );
}
