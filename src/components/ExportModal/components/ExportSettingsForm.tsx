import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ResolutionSelectItems, FpsSelectItems } from '@/components/ui/render-select-items';
import { ProBadge } from '@/components/ui/pro-badge';
import type { AspectRatio, ExportResolution } from '@/types/render';
import type { ExportLimits } from '@/lib/cloudAccess';

interface ExportSettingsFormProps {
  aspectRatio: AspectRatio;
  isVertical: boolean;
  /** What the user picked, which may be past the plan: Pro picks show their badge and turn Export into Get Wanderer. */
  resolution: ExportResolution;
  fps: 30 | 60;
  limits: ExportLimits;
  startTime: number;
  endTime: number;
  duration: number;
  disabled: boolean;
  onAspectRatioChange: (v: AspectRatio) => void;
  onOrientationChange: (isVertical: boolean) => void;
  onResolutionChange: (v: ExportResolution) => void;
  onFpsChange: (fps: 30 | 60) => void;
  onStartTimeChange: (time: number) => void;
  onEndTimeChange: (time: number) => void;
}

export function ExportSettingsForm({
  aspectRatio,
  isVertical,
  resolution,
  fps,
  limits,
  startTime,
  endTime,
  duration,
  disabled,
  onAspectRatioChange,
  onOrientationChange,
  onResolutionChange,
  onFpsChange,
  onStartTimeChange,
  onEndTimeChange,
}: ExportSettingsFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Aspect ratio">
          <Select
            value={aspectRatio}
            onValueChange={(v) => onAspectRatioChange(v as AspectRatio)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="21:9">21:9</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
              <SelectItem value="1:1">1:1</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Orientation">
          <SegmentedControl
            options={[
              { value: 'landscape', label: 'Landscape', icon: <Monitor size={14} /> },
              { value: 'portrait', label: 'Portrait', icon: <Smartphone size={14} /> },
            ]}
            value={isVertical ? 'portrait' : 'landscape'}
            onValueChange={(v) => onOrientationChange(v === 'portrait')}
            className="h-9 w-full"
            disabled={disabled}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Resolution">
          <Select
            value={resolution}
            onValueChange={(v) => onResolutionChange(v as ExportResolution)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 text-sm flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <ResolutionSelectItems limits={limits} lockedSelectable />
            </SelectContent>
          </Select>
        </Field>

        <Field label="Frame rate">
          <Select
            value={fps.toString()}
            onValueChange={(v) => onFpsChange(Number(v) as 30 | 60)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <FpsSelectItems limits={limits} showUnit lockedSelectable />
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time (s)">
          <Input
            type="number"
            min={0}
            max={endTime}
            step={0.1}
            value={startTime}
            onChange={(e) => onStartTimeChange(Number(e.target.value))}
            disabled={disabled}
            className="h-9 text-sm"
          />
        </Field>
        <Field
          label={
            <span className="flex items-center gap-1.5">
              End time (s)
              {endTime > limits.maxDuration && <ProBadge />}
            </span>
          }
        >
          <Input
            type="number"
            min={startTime}
            max={duration}
            step={0.1}
            value={endTime}
            onChange={(e) => onEndTimeChange(Math.min(Number(e.target.value), duration))}
            disabled={disabled}
            className="h-9 text-sm"
          />
        </Field>
      </div>
    </div>
  );
}
