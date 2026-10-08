import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemOverlays } from './SystemOverlays';
import { resolveSystemOverlays } from './resolve';

const renderFor = (branding: 'free' | 'paid') =>
  render(<SystemOverlays layers={resolveSystemOverlays({ mode: 'present', branding })} />);

const anchors = (c: HTMLElement) =>
  Object.fromEntries([...c.querySelectorAll('[data-overlay]')].map((e) => [e.getAttribute('data-overlay'), e.getAttribute('data-anchor')]));

describe('SystemOverlays', () => {
  it('free: brand top-left, mapbox logo bottom-left, attribution bottom-right', () => {
    const { container } = renderFor('free');
    expect(anchors(container)).toEqual({ brand: 'top-left', 'mapbox-logo': 'bottom-left', attribution: 'bottom-right' });
    expect(screen.getByText("li'l Mappo")).toBeTruthy();
    expect(screen.getByText('© Mapbox © OpenStreetMap')).toBeTruthy();
    expect(screen.getByAltText('Mapbox')).toBeTruthy();
  });

  it('paid: no brand', () => {
    const { container } = renderFor('paid');
    expect(anchors(container)).toEqual({ 'mapbox-logo': 'bottom-left', attribution: 'bottom-right' });
    expect(screen.queryByText("li'l Mappo")).toBeNull();
  });

  it('is non-interactive and renders nothing for no layers', () => {
    const { getByTestId } = renderFor('free');
    expect(getByTestId('system-overlays').className).toContain('pointer-events-none');
    const empty = render(<SystemOverlays layers={[]} />);
    expect(empty.container.querySelectorAll('[data-overlay]').length).toBe(0);
  });
});
