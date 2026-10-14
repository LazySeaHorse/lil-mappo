import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/annotations/styles/index';
import { clearHistory } from '@/store/history';
import { createCalloutItem } from '@/store/itemFactories';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { STYLE_TERMS } from '@/lib/terms';
import { AnnotationInspector } from './AnnotationInspector';

const { toastMessage } = vi.hoisted(() => ({ toastMessage: vi.fn() }));
vi.mock('./stylePreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stylePreview')>()),
  getStylePreview: vi.fn().mockResolvedValue(null),
}));
vi.mock('sonner', () => ({ toast: Object.assign(toastMessage, { success: vi.fn(), error: vi.fn() }) }));

function setCallout() {
  const item = createCalloutItem({ id: 'c1', styleId: 'leader-line', content: { title: 'Park' }, lngLat: [1, 2], startTime: 0 })!;
  const withColor = { ...item, settings: { ...item.settings, accentColor: '#123456' } };
  useProjectStore.setState({ items: { c1: withColor }, itemOrder: ['c1'], selectedItemId: 'c1', activePicker: null });
  clearHistory();
  return withColor;
}
/** Opens the folded picker and clicks a style. */
function pickStyle(name: string) {
  fireEvent.click(screen.getByRole('button', { name: STYLE_TERMS.change }));
  fireEvent.click(screen.getByRole('button', { name }));
}
const stored = () => useProjectStore.getState().items.c1 as CalloutItem;

describe('changing the callout style', () => {
  beforeEach(() => toastMessage.mockReset());

  it('keeps settings the new style shares and tells the user, with Undo', () => {
    render(<AnnotationInspector item={setCallout()} />);
    pickStyle('Target Lock');

    expect(stored().styleId).toBe('target-lock');
    expect(stored().settings.accentColor).toBe('#123456');
    expect(toastMessage).toHaveBeenCalledTimes(1);
    expect(toastMessage.mock.calls[0][0]).toBe(STYLE_TERMS.changed);
    expect(toastMessage.mock.calls[0][1].action.label).toBe(STYLE_TERMS.undo);
  });

  it('puts the old style back when the user clicks Undo', () => {
    render(<AnnotationInspector item={setCallout()} />);
    pickStyle('Target Lock');
    toastMessage.mock.calls[0][1].action.onClick();

    expect(stored().styleId).toBe('leader-line');
    expect(stored().settings.accentColor).toBe('#123456');
    expect(stored().settings.lineColor).toBeDefined();
  });

  it('does nothing when the user picks the style it already has', () => {
    render(<AnnotationInspector item={setCallout()} />);
    pickStyle('Leader Line');
    expect(toastMessage).not.toHaveBeenCalled();
  });
});
