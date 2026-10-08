import { useEffect, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { projectDocumentChanged } from '@/store/historyKeys';
import { workingProjectDraftManager } from '@/services/workingProjectDraft';

/** Hydrates the last local working draft, then keeps it autosaved. */
export function useWorkingProjectDraft(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    const flush = () => {
      void workingProjectDraftManager.flush().catch(() => {
        // pagehide/auth flushes are best effort; the five-second loop retries.
      });
    };

    const begin = () => {
      // Defer saves during export; the draft stays dirty for a later tick.
      workingProjectDraftManager.start(
        () => useProjectStore.getState(),
        () => useProjectStore.getState().isExporting,
      );
      // Skip 60 Hz playhead churn: only persisted document fields mark the draft dirty.
      unsubscribe = useProjectStore.subscribe((state, prev) => {
        if (projectDocumentChanged(state, prev)) workingProjectDraftManager.markDirty();
      });
      window.addEventListener('pagehide', flush);
    };

    void workingProjectDraftManager
      .hydrate()
      .then((draft) => {
        if (!active) return;
        if (draft) useProjectStore.getState().loadFullProject(draft);

        begin();
        setReady(true);
      })
      .catch(() => {
        if (!active) return;

        // Storage being unavailable must not prevent the editor from opening.
        begin();
        setReady(true);
      });

    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('pagehide', flush);
      workingProjectDraftManager.stop();
    };
  }, []);

  return ready;
}
