import { useProjectStore } from '@/store/useProjectStore';
import { TIMING_LABELS } from '@/lib/terms';
import { cn } from '@/lib/utils';
import { InspectorSection } from '../InspectorSection';
import { TimeRow } from '../controls/TimeRow';
import { ReadoutRow } from '../controls/ReadoutRow';
import type { TimingAdapter } from './timingAdapters';
import { TimingBehaviour } from './TimingBehaviour';

/**
 * The one timing section for every item. The adapter says which fields the
 * kind of item has; `onChange` gets the store update to apply.
 */
export function TimingSection<T>({
  adapter,
  item,
  onChange,
}: {
  adapter: TimingAdapter<T>;
  item: T;
  onChange: (updates: Partial<T>) => void;
}) {
  const model = adapter.read(item);
  // An empty update is a change the adapter rejected (e.g. an end before the start).
  const write = (patch: Parameters<typeof adapter.write>[1]) => {
    const updates = adapter.write(item, patch);
    if (Object.keys(updates).length === 0) return false;
    onChange(updates);
    return true;
  };
  const hasLength = model.length !== undefined && model.end !== undefined;
  const playhead = () => useProjectStore.getState().playheadTime;
  // The playhead buttons set that edge, as typing the time would. When the other edge is
  // in the way, the item moves to the playhead and keeps its length.
  const startAtPlayhead = () => {
    const t = playhead();
    if (!hasLength || !write({ start: t, end: model.end })) write({ start: t });
  };
  const endAtPlayhead = () => {
    const t = playhead();
    if (!write({ end: t })) write({ start: t - model.length! });
  };

  return (
    <InspectorSection kind={adapter.panel} id="timing">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2">
          <div data-slot="timing-times" className={cn("grid gap-2", hasLength ? "grid-cols-2" : "grid-cols-1")}>
            <TimeRow
              label={TIMING_LABELS.start}
              value={model.start}
              // With an end, a new start trims the start edge and the end stays.
              onChange={(start) => write(hasLength ? { start, end: model.end } : { start })}
              onUsePlayhead={startAtPlayhead}
            />
            {hasLength && (
              <TimeRow
                label={TIMING_LABELS.end}
                value={model.end!}
                onChange={(end) => write({ end })}
                onUsePlayhead={endAtPlayhead}
              />
            )}
          </div>
          {hasLength && (
            <ReadoutRow label={TIMING_LABELS.length} value={`${model.length!.toFixed(2)} s`} />
          )}
        </div>

        <TimingBehaviour adapter={adapter} model={model} write={write} />
      </div>
    </InspectorSection>
  );
}
