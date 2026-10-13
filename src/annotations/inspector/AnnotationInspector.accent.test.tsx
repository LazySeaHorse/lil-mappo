import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/annotations/styles/index';
import { ACCENT_TERMS } from '@/lib/terms';
import { clearHistory, getHistoryEntries, undo } from '@/store/history';
import { createCalloutItem } from '@/store/itemFactories';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { AnnotationInspector } from './AnnotationInspector';

vi.mock('./stylePreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stylePreview')>()),
  getStylePreview: vi.fn().mockResolvedValue(null),
}));

const stored = () => useProjectStore.getState().items.c1 as CalloutItem;

describe('callout accent color', () => {
  beforeEach(() => {
    const item = createCalloutItem({ id: 'c1', styleId: 'leader-line', content: { title: 'Park' }, lngLat: [1, 2], startTime: 0 })!;
    useProjectStore.setState({ items: { c1: item }, itemOrder: ['c1'], selectedItemId: 'c1' });
    clearHistory();
    render(<AnnotationInspector item={item} />);
  });

  it('sets every accent color of the style in one undoable step', () => {
    const before = { ...stored().settings };
    expect(before.lineColor).not.toBe(before.accentColor);

    fireEvent.click(screen.getByLabelText('Select color #ef4444'));

    expect(stored().settings).toMatchObject({ lineColor: '#ef4444', accentColor: '#ef4444', textColor: before.textColor });
    expect(getHistoryEntries().past).toHaveLength(1);
    undo();
    expect(stored().settings).toMatchObject({ lineColor: before.lineColor, accentColor: before.accentColor });
  });

  it('keeps the text color behind Customize colors', () => {
    expect(screen.queryByText('Text color')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ACCENT_TERMS.customize }));
    expect(screen.getByText('Text color')).toBeInTheDocument();
  });
});
