import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundaryInspector } from './BoundaryInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import type { BoundaryItem } from '@/store/types';

vi.mock('./BoundarySearch', () => ({ BoundarySearch: () => <div data-testid="boundary-search-mock" /> }));

function boundary(style: Partial<BoundaryItem['style']> = {}): BoundaryItem {
  return {
    id: 'b1',
    kind: 'boundary',
    placeName: 'Manhattan',
    geojson: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
    startTime: 0,
    endTime: 4,
    easing: 'linear', exitAnimation: 'none',
    style: { ...DEFAULT_BOUNDARY_STYLE, ...style },
  };
}

/** The switch in the row labelled "Keep roads visible". */
const roadsSwitch = () => within(screen.getByText('Keep roads visible').parentElement!.parentElement!).getByRole('switch');

const styleOf = () => (useProjectStore.getState().items.b1 as BoundaryItem).style;

function mount(item: BoundaryItem) {
  useProjectStore.setState({ items: { b1: item }, itemOrder: ['b1'], selectedItemId: 'b1' });
  render(<BoundaryInspector item={item} />);
}

describe('BoundaryInspector keep roads visible', () => {
  beforeEach(() => useProjectStore.setState({ items: {}, itemOrder: [] }));

  it('offers the switch for a colour fill, off by default, with what it does', () => {
    mount(boundary());
    expect(roadsSwitch()).not.toBeChecked();
    // Its hint is the (i) tip right after the label.
    expect(within(screen.getByText('Keep roads visible').parentElement!).getByRole('button', { name: 'More info' })).toBeInTheDocument();
  });

  it('turns the setting on and off', () => {
    mount(boundary());
    fireEvent.click(roadsSwitch());
    expect(styleOf().fillUnderRoads).toBe(true);
  });

  it('shows a boundary that has it on as on', () => {
    mount(boundary({ fillUnderRoads: true }));
    expect(roadsSwitch()).toBeChecked();
  });

  it('hides the switch for a flag fill, which is always under the roads', () => {
    mount(boundary({ fillMode: 'flag', flagCode: 'fr' }));
    expect(screen.queryByText('Keep roads visible')).not.toBeInTheDocument();
  });
});
