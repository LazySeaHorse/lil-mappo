import { afterEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { withTemporaryProjectPlayhead } from './captureSession';

const originalPlayheadTime = useProjectStore.getState().playheadTime;

afterEach(() => {
  useProjectStore.getState().setPlayheadTime(originalPlayheadTime);
});

describe('withTemporaryProjectPlayhead', () => {
  it('restores the playhead after successful capture', async () => {
    useProjectStore.getState().setPlayheadTime(3);

    const result = await withTemporaryProjectPlayhead(async () => {
      useProjectStore.getState().setPlayheadTime(12);
      return 'captured';
    });

    expect(result).toBe('captured');
    expect(useProjectStore.getState().playheadTime).toBe(3);
  });

  it('restores the playhead when capture fails', async () => {
    useProjectStore.getState().setPlayheadTime(4);
    const failure = new Error('capture failed');

    await expect(withTemporaryProjectPlayhead(async () => {
      useProjectStore.getState().setPlayheadTime(15);
      throw failure;
    })).rejects.toBe(failure);

    expect(useProjectStore.getState().playheadTime).toBe(4);
  });
});
