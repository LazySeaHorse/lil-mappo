import { useState, useEffect } from 'react';
import { getLocalExportCapability, type LocalExportCapability } from '@/services/videoExport';

export function useLocalExportCapability(
  width: number,
  height: number,
  fps: number,
  open: boolean
): LocalExportCapability | null {
  const [capability, setCapability] = useState<LocalExportCapability | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    getLocalExportCapability(width, height, fps)
      .then((cap) => {
        if (!cancelled) setCapability(cap);
      })
      .catch(() => {
        if (!cancelled) setCapability({ status: 'limited' });
      });

    return () => {
      cancelled = true;
    };
  }, [open, width, height, fps]);

  return capability;
}
