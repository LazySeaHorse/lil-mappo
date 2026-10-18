import React from 'react';
import { Crown } from 'lucide-react';
import { Mappo } from '@/components/Mappo/Mappo';
import { Button } from '@/components/ui/button';
import type { ExportLimits } from '@/lib/cloudAccess';

interface FreeLimitNoticeProps {
  limits: ExportLimits;
  onUpgrade: () => void;
}

/** Tells a free-plan user what the plan caps and offers the upgrade. Mappo is cropped by the banner's bottom edge. */
export function FreeLimitNotice({ limits, onUpgrade }: FreeLimitNoticeProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-primary/30 bg-background ring-[3px] ring-primary/5">
      <div className="relative h-[124px] overflow-hidden bg-gradient-to-br from-primary/15 to-primary/[0.03] px-3.5 pt-3.5">
        <Mappo
          mood="key"
          className="absolute -bottom-[30px] right-3.5 w-[116px] animate-in slide-in-from-bottom-6 duration-500 motion-reduce:animate-none"
        />
        <h3 className="relative text-sm font-medium leading-tight text-foreground">
          The key to 4K is one step away
        </h3>
        <p className="relative mt-3.5 max-w-[132px] text-xs leading-snug text-muted-foreground">
          Free exports max out at{' '}
          <span className="font-medium text-foreground">{limits.maxResolution}</span>,{' '}
          <span className="font-medium text-foreground">{limits.maxFps} FPS</span> and{' '}
          <span className="font-medium text-foreground">{limits.maxDuration} s</span>.
        </p>
      </div>
      <div className="border-t border-primary/15 p-3">
        <Button onClick={onUpgrade} size="sm" className="h-[34px] w-full gap-1.5 rounded-lg text-xs font-medium">
          <Crown size={13} aria-hidden="true" /> Unlock 4K and 60 FPS
        </Button>
      </div>
    </div>
  );
}
