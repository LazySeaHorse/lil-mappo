import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { openProjectSettings } from './openProjectSettings';

const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/** The panel's scroll box (200px of a 1000px content) holding the Map section 600px down. */
function renderPanel() {
  document.body.innerHTML = '<div id="panel" style="overflow-y: auto"><section data-section="project-env"></section></div>';
  const panel = document.getElementById('panel')!;
  Object.defineProperty(panel, 'clientHeight', { value: 200 });
  Object.defineProperty(panel, 'scrollHeight', { value: 1000 });
  panel.getBoundingClientRect = () => rect(0, 200);
  panel.scrollTo = vi.fn() as never;
  document.querySelector('section')!.getBoundingClientRect = () => rect(600, 80);
  return panel;
}

describe('openProjectSettings', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;
  let panel: HTMLElement;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as never;
    panel = renderPanel();
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

  it('scrolls the panel to the map settings when asked, without scrollIntoView', () => {
    openProjectSettings({ scrollTo: 'map' });
    expect(useProjectStore.getState().selectedItemId).toBeNull();
    expect(panel.scrollTo).toHaveBeenCalledTimes(1);
    expect(panel.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 600 }));
    // scrollIntoView would also scroll a page that frames the app.
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('waits for the panel to render before it scrolls', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    document.body.innerHTML = '';
    openProjectSettings({ scrollTo: 'map' });
    expect(panel.scrollTo).not.toHaveBeenCalled();
    const late = renderPanel();
    await vi.advanceTimersByTimeAsync(50);
    expect(late.scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
