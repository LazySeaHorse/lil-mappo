import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { formatTimelineTime } from './timelineTime';

const TRACK_LABEL_WIDTH = 160;

export function useTimelinePlayheadSync(pixelsPerSecond: number) {
  const rulerDiamondRef = useRef<HTMLDivElement>(null);
  const trackLineRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const pixelsPerSecondRef = useRef(pixelsPerSecond);

  useEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond;
  }, [pixelsPerSecond]);

  useEffect(() => useProjectStore.subscribe((state) => {
    updatePlayheadElements(state.playheadTime, pixelsPerSecondRef.current);
  }), []);

  useEffect(() => {
    updatePlayheadElements(useProjectStore.getState().playheadTime, pixelsPerSecond);
  }, [pixelsPerSecond]);

  function updatePlayheadElements(playheadTime: number, scale: number) {
    const x = playheadTime * scale;

    if (rulerDiamondRef.current) rulerDiamondRef.current.style.left = `${x}px`;
    if (trackLineRef.current) trackLineRef.current.style.left = `${x + TRACK_LABEL_WIDTH}px`;
    if (timeDisplayRef.current) timeDisplayRef.current.textContent = formatTimelineTime(playheadTime);
  }

  return { rulerDiamondRef, timeDisplayRef, trackLineRef };
}
