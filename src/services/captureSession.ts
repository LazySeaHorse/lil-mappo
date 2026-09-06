import { useProjectStore } from '@/store/useProjectStore';

/** Runs capture work with a temporary playhead and restores editor time afterward. */
export async function withTemporaryProjectPlayhead<T>(capture: () => Promise<T>): Promise<T> {
  const initialPlayheadTime = useProjectStore.getState().playheadTime;

  try {
    return await capture();
  } finally {
    useProjectStore.getState().setPlayheadTime(initialPlayheadTime);
  }
}
