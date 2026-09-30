import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StyleIcon } from './StyleIcon';
import { STYLE_ICONS, isStyleIconName } from './styleIcons';

describe('style icons', () => {
  it('covers the icons the planned styles use', () => {
    for (const name of [
      'move-up-right', 'tag', 'crosshair', 'newspaper', 'type', 'stamp', 'flag', 'image',
      'hash', 'trending-up', 'pen-line', 'circle-dashed', 'map-pin', 'list-ordered', 'signpost',
    ]) {
      expect(isStyleIconName(name), name).toBe(true);
    }
    expect(Object.keys(STYLE_ICONS).length).toBeGreaterThanOrEqual(15);
  });

  it('renders the named icon, or a square for an unknown name', () => {
    const known = render(<StyleIcon name="stamp" />).container.querySelector('svg')!;
    expect(known.getAttribute('class')).toContain('lucide-stamp');
    const unknown = render(<StyleIcon name="nope" />).container.querySelector('svg')!;
    expect(unknown.getAttribute('class')).toContain('lucide-square');
    expect(isStyleIconName('toString')).toBe(false);
  });
});
