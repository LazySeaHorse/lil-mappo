import { useEffect, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { projectDocumentChanged } from '@/store/historyKeys';
import { workingProjectDraftManager } from '@/services/workingProjectDraft';
import { IS_DEMO_FRAME } from '@/demo/isDemo';

/** Hydrates the last local working draft, then keeps it autosaved. */
export function useWorkingProjectDraft(): boolean {
  // The demo frame starts from an empty project every load and never saves a draft.
  const [ready, setReady] = useState(IS_DEMO_FRAME);

  useEffect(() => {
    if (IS_DEMO_FRAME) return;
    let active = true;
    let unsubscribe: (() => void) | null = null;

    const flush = () => {
      void workingProjectDraftManager.flush().catch(() => {
        // pagehide/unmount flushes are best effort; the five-second loop retries.
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
      // Stopping drops the project getter, so capture the latest edits first. This is what
      // preserves them when a crash unmounts the editor.
      flush();
      workingProjectDraftManager.stop();
    };
  }, []);

  return ready;
}
