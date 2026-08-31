import React from 'react';
import { Lock, Monitor, Smartphone } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ResolutionSelectItems, FpsSelectItems } from '@/components/ui/render-select-items';
import type { AspectRatio, ExportResolution } from '@/types/render';
import type { ExportLimits } from '@/lib/cloudAccess';
import type { ExportPlan } from '../exportPlan';

interface ExportSettingsFormProps {
  aspectRatio: AspectRatio;
  isVertical: boolean;
  exportPlan: ExportPlan;
  limits: ExportLimits;
  startTime: number;
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
  exportPlan,
  limits,
  startTime,
  duration,
  disabled,
  onAspectRatioChange,
  onOrientationChange,
  onResolutionChange,
  onFpsChange,
  onStartTimeChange,
  onEndTimeChange,
}: ExportSettingsFormProps) {
  const { renderConfig: effectiveRenderConfig } = exportPlan;

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
        <Field
          label={
            <span className="flex items-center gap-1">
              Resolution
              {limits.limited && <Lock size={10} className="text-muted-foreground/60" />}
            </span>
          }
        >
          <Select
            value={effectiveRenderConfig.exportResolution}
            onValueChange={(v) => onResolutionChange(v as ExportResolution)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 text-sm flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <ResolutionSelectItems limits={limits} />
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={
            <span className="flex items-center gap-1">
              Frame rate
              {limits.limited && <Lock size={10} className="text-muted-foreground/60" />}
            </span>
          }
        >
          <Select
            value={effectiveRenderConfig.fps.toString()}
            onValueChange={(v) => onFpsChange(Number(v) as 30 | 60)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <FpsSelectItems limits={limits} showUnit />
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time (s)">
          <Input
            type="number"
            min={0}
            max={exportPlan.endTime}
            step={0.1}
            value={startTime}
            onChange={(e) => onStartTimeChange(Number(e.target.value))}
            disabled={disabled}
            className="h-9 text-sm"
          />
        </Field>
        <Field
          label={
            <span className="flex items-center gap-1">
              End time (s)
              {limits.limited && <Lock size={10} className="text-muted-foreground/60" />}
            </span>
          }
        >
          <Input
            type="number"
            min={startTime}
            max={Math.min(duration, limits.maxDuration)}
            step={0.1}
            value={exportPlan.endTime}
            onChange={(e) => onEndTimeChange(Math.min(Number(e.target.value), limits.maxDuration))}
            disabled={disabled}
            className="h-9 text-sm"
          />
        </Field>
      </div>
    </div>
  );
}
