import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { SizeControls } from './SizeControls';
import type { CalloutItem } from '@/store/types';

type Sizing = Pick<CalloutItem, 'scale' | 'sizeMode' | 'referenceZoom'>;

function mount(item: Sizing, zoom: number | null = 14.25) {
  const onChange = vi.fn();
  const mapRef = { current: zoom === null ? null : ({ getMap: () => ({ getZoom: () => zoom }) } as unknown as MapRef) };
  render(
    <MapRefContext.Provider value={mapRef}>
      <SizeControls item={item} onChange={onChange} />
    </MapRefContext.Provider>,
  );
  return onChange;
}

const screenSized: Sizing = { scale: 1, sizeMode: 'screen', referenceZoom: 12 };

describe('SizeControls', () => {
  it('shows the scale as a multiplier at the centre of the slider', () => {
    mount(screenSized);
    expect(screen.getByText('1.0×')).toBeTruthy();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
  });

  it('shows a logarithmic position for other scales', () => {
    mount({ ...screenSized, scale: 2 });
    expect(screen.getByText('2.0×')).toBeTruthy();
    expect(Number(screen.getByRole('slider').getAttribute('aria-valuenow'))).toBeCloseTo(0.5);
  });

  it('sets the scale from the slider position', () => {
    const onChange = mount(screenSized);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].scale).toBeCloseTo(4);
  });

  it('returns to 1x on double-click', () => {
    const onChange = mount({ ...screenSized, scale: 3 });
    fireEvent.doubleClick(screen.getByRole('slider').closest('[data-slot="slider"]')!);
    expect(onChange).toHaveBeenCalledWith({ scale: 1 });
  });

  it('turns on scaling with the map at the editor zoom', () => {
    const onChange = mount(screenSized);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith({ sizeMode: 'map', referenceZoom: 14.25 });
  });

  it('falls back to the default zoom when there is no map', () => {
    const onChange = mount(screenSized, null);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith({ sizeMode: 'map', referenceZoom: 12 });
  });

  it('turns scaling with the map off without touching the size', () => {
    const onChange = mount({ scale: 2, sizeMode: 'map', referenceZoom: 10 });
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith({ sizeMode: 'screen' });
  });

  it('offers to re-base the reference zoom only in map mode', () => {
    mount(screenSized);
    expect(screen.queryByRole('button', { name: /use current zoom/i })).toBeNull();
  });

  it('re-bases the reference zoom on the current zoom', () => {
    const onChange = mount({ scale: 1, sizeMode: 'map', referenceZoom: 10 });
    expect(screen.getByText(/set at zoom 10\.0/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /use current zoom/i }));
    expect(onChange).toHaveBeenCalledWith({ referenceZoom: 14.25 });
  });
});
