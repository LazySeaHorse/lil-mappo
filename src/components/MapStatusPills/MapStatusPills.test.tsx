import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MapStatusPills } from './MapStatusPills';
import { useProjectStore } from '@/store/useProjectStore';
import { PANEL_MARGIN, belowToolbarTop } from '@/constants/layout';

const initialStore = useProjectStore.getState();

beforeEach(() => {
  act(() => useProjectStore.setState(initialStore, true));
});

describe('MapStatusPills', () => {
  it('stacks its pills top to bottom in the order given, just below the top bar', () => {
    render(
      <MapStatusPills>
        <div data-testid="first" />
        <div data-testid="second" />
      </MapStatusPills>,
    );

    const stack = screen.getByTestId('map-status-pills');
    expect([...stack.children].map((el) => el.getAttribute('data-testid'))).toEqual(['first', 'second']);
    expect(stack).toHaveClass('flex-col');
    expect(stack.style.top).toBe(belowToolbarTop(false));
  });

  it('centres on the width the inspector leaves free', () => {
    render(<MapStatusPills><div /></MapStatusPills>);
    const stack = screen.getByTestId('map-status-pills');
    expect(stack.style.left).toBe(`${PANEL_MARGIN}px`);

    act(() => useProjectStore.getState().setIsInspectorOpen(false));
    const closed = parseInt(stack.style.right);
    act(() => useProjectStore.getState().setIsInspectorOpen(true));
    expect(parseInt(stack.style.right)).toBeGreaterThan(closed);
  });
});
