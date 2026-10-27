import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { TIMELINE_GUTTER_WIDTH } from '@/constants/layout';
import { formatTimelineTime } from './timelineTime';

export function useTimelinePlayheadSync(pixelsPerSecond: number) {
  const rulerDiamondRef = useRef<HTMLDivElement>(null);
  const trackLineRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const pixelsPerSecondRef = useRef(pixelsPerSecond);

  useEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond;
  }, [pixelsPerSecond]);

  useEffect(() => useProjectStore.subscribe(
    (state) => state.playheadTime,
    (playheadTime) => updatePlayheadElements(playheadTime, pixelsPerSecondRef.current),
  ), []);

  useEffect(() => {
    updatePlayheadElements(useProjectStore.getState().playheadTime, pixelsPerSecond);
  }, [pixelsPerSecond]);

  function updatePlayheadElements(playheadTime: number, scale: number) {
    const x = playheadTime * scale;

    if (rulerDiamondRef.current) rulerDiamondRef.current.style.left = `${x}px`;
    if (trackLineRef.current) trackLineRef.current.style.left = `${x + TIMELINE_GUTTER_WIDTH}px`;
    if (timeDisplayRef.current) timeDisplayRef.current.textContent = formatTimelineTime(playheadTime);
  }

  return { rulerDiamondRef, timeDisplayRef, trackLineRef };
}
