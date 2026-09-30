import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnnotationInspector } from './AnnotationInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { hasStyle, registerStyle } from '@/annotations/registry';
import { registerTestStyles, testCardStyle } from '@/annotations/testStyles';
import type { CalloutItem } from '@/store/types';
import type { AnnotationContent } from '@/annotations/types';

const imageToDataUrl = vi.fn();
vi.mock('@/utils/imageDownscale', () => ({ imageFileToDataUrl: (f: File) => imageToDataUrl(f) }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));
vi.mock('@/components/Search/SearchField', () => ({ SearchField: () => <div /> }));

const ALL = 'test-all-slots';
const NONE = 'test-title-only';
const COORDS = 'test-eyebrow-coordinates';
registerTestStyles();
if (!hasStyle(ALL)) {
  registerStyle({ ...testCardStyle, id: ALL, name: 'All slots', contentSlots: ['image', 'metric', 'badge', 'body', 'subtitle', 'eyebrow', 'title'] });
  registerStyle({ ...testCardStyle, id: COORDS, name: 'Coordinates', contentSlots: ['eyebrow', 'title'], eyebrowFallback: 'coordinates' });
  registerStyle({ ...testCardStyle, id: NONE, name: 'Title only', contentSlots: ['title'] });
}

function callout(styleId: string, content: AnnotationContent): CalloutItem {
  return {
    id: 'c1', kind: 'callout', styleId, styleVersion: 1, content,
    binding: { kind: 'geographic', lngLat: [1, 2], altitude: 0 },
    offset: [0, 0], anchor: 'bottom', startTime: 0, endTime: 5,
    transition: { enter: 'fade', exit: 'fade', enterDuration: 0.4, exitDuration: 0.3 },
    connector: { visible: false, style: 'dashed', color: '#fff', width: 2, endDot: true, endDotRadius: 3 },
    opacity: 1, scale: 1, settings: {}, linkTitleToLocation: true,
  };
}

function mount(styleId: string, content: AnnotationContent) {
  const item = callout(styleId, content);
  useProjectStore.setState({ items: { c1: item }, itemOrder: ['c1'], selectedItemId: 'c1' });
  const view = render(<AnnotationInspector item={item} />);
  const current = () => (useProjectStore.getState().items.c1 as CalloutItem);
  return { ...view, current, rerenderCurrent: () => view.rerender(<AnnotationInspector item={current()} />) };
}

describe('callout content fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows only the slots the style consumes, in a fixed order', () => {
    mount(ALL, { title: 'T' });
    const labels = ['Eyebrow', 'Subtitle', 'Body', 'Badge', 'Number value', 'Image file'].map((l) => screen.getByLabelText(l));
    labels.slice(0, -1).forEach((el, i) => {
      expect(el.compareDocumentPosition(labels[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(screen.getByLabelText('Eyebrow')).not.toHaveAttribute('placeholder', 'Defaults to coordinates');
    expect(screen.getByLabelText('Body').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Number value')).toHaveAttribute('type', 'number');
  });

  it('promises coordinates in the eyebrow only for styles that fall back to them', () => {
    mount(COORDS, { title: 'T' });
    expect(screen.getByLabelText('Eyebrow')).toHaveAttribute('placeholder', 'Defaults to coordinates');
  });

  it('shows no extra fields for a title-only style', () => {
    mount(NONE, { title: 'T', subtitle: 'hidden' });
    expect(screen.queryByLabelText('Subtitle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Body')).not.toBeInTheDocument();
  });

  it('edits text slots and removes the key when cleared', () => {
    const { current } = mount(ALL, { title: 'T' });
    fireEvent.change(screen.getByLabelText('Subtitle'), { target: { value: 'Sub' } });
    expect(current().content).toEqual({ title: 'T', subtitle: 'Sub' });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Long' } });
    expect(current().content.body).toBe('Long');
    fireEvent.change(screen.getByLabelText('Subtitle'), { target: { value: '' } });
    expect('subtitle' in current().content).toBe(false);
  });

  it('does not unlink the title from the location when editing other fields', () => {
    const { current } = mount(ALL, { title: 'T' });
    fireEvent.change(screen.getByLabelText('Badge'), { target: { value: 'B' } });
    expect(current().linkTitleToLocation).toBe(true);
    fireEvent.change(screen.getByDisplayValue('T'), { target: { value: 'New' } });
    expect(current().linkTitleToLocation).toBe(false);
  });

  it('edits the metric and clears it with the value', () => {
    const { current, rerenderCurrent } = mount(ALL, { title: 'T' });
    expect(screen.getByLabelText('Number unit')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Number value'), { target: { value: '42' } });
    expect(current().content.metric).toEqual({ value: 42 });
    rerenderCurrent();
    fireEvent.change(screen.getByLabelText('Number unit'), { target: { value: 'km' } });
    rerenderCurrent();
    fireEvent.change(screen.getByLabelText('Number label'), { target: { value: 'Distance' } });
    expect(current().content.metric).toEqual({ value: 42, unit: 'km', label: 'Distance' });
    rerenderCurrent();
    fireEvent.change(screen.getByLabelText('Number unit'), { target: { value: '' } });
    expect(current().content.metric).toEqual({ value: 42, label: 'Distance' });
    rerenderCurrent();
    fireEvent.change(screen.getByLabelText('Number value'), { target: { value: '' } });
    expect('metric' in current().content).toBe(false);
  });

  it('keeps hidden values when switching to a style that does not use them', () => {
    const { current } = mount(ALL, { title: 'T', subtitle: 'kept', metric: { value: 1 } });
    fireEvent.change(screen.getByLabelText('Badge'), { target: { value: 'B' } });
    expect(current().content).toMatchObject({ subtitle: 'kept', metric: { value: 1 }, badge: 'B' });
  });

  it('adds an image from a file, and replaces or removes it', async () => {
    imageToDataUrl.mockResolvedValueOnce('data:image/jpeg;base64,AAA');
    const { current, rerenderCurrent } = mount(ALL, { title: 'T' });
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Image file'), { target: { files: [file] } });
    await waitFor(() => expect(current().content.image).toBe('data:image/jpeg;base64,AAA'));
    rerenderCurrent();
    expect(screen.getByAltText('Callout image')).toHaveAttribute('src', 'data:image/jpeg;base64,AAA');
    expect(screen.getByRole('button', { name: /Replace/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect('image' in current().content).toBe(false);
  });

  it('accepts a dropped image and toasts on rejection', async () => {
    imageToDataUrl.mockRejectedValueOnce(new Error('Choose a JPEG, PNG, WebP or GIF image.'));
    const { current } = mount(ALL, { title: 'T' });
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    fireEvent.drop(screen.getByTestId('image-dropzone'), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Choose a JPEG, PNG, WebP or GIF image.'));
    expect(current().content.image).toBeUndefined();
  });
});
