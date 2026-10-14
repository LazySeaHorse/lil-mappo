import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { openProjectSettings } from './openProjectSettings';

describe('openProjectSettings', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as never;
    document.body.innerHTML = '<section data-section="project-env"></section>';
    useProjectStore.setState({ selectedItemId: 'x', isInspectorOpen: false });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows the project settings panel: nothing selected, inspector open', () => {
    openProjectSettings();
    const s = useProjectStore.getState();
    expect(s.selectedItemId).toBeNull();
    expect(s.isInspectorOpen).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls the map settings into view when asked', () => {
    openProjectSettings({ scrollTo: 'map' });
    expect(useProjectStore.getState().selectedItemId).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('waits for the panel to render before it scrolls', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    document.body.innerHTML = '';
    openProjectSettings({ scrollTo: 'map' });
    expect(scrollIntoView).not.toHaveBeenCalled();
    document.body.innerHTML = '<section data-section="project-env"></section>';
    await vi.advanceTimersByTimeAsync(50);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
