import { useEffect, useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
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

    void workingProjectDraftManager
      .hydrate()
      .then((draft) => {
        if (!active) return;
        if (draft) useProjectStore.getState().loadFullProject(draft);

        workingProjectDraftManager.start(() => useProjectStore.getState());
        unsubscribe = useProjectStore.subscribe(() => {
          workingProjectDraftManager.markDirty();
        });
        window.addEventListener('pagehide', flush);
        setReady(true);
      })
      .catch(() => {
        if (!active) return;

        // Storage being unavailable must not prevent the editor from opening.
        workingProjectDraftManager.start(() => useProjectStore.getState());
        unsubscribe = useProjectStore.subscribe(() => {
          workingProjectDraftManager.markDirty();
        });
        window.addEventListener('pagehide', flush);
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
