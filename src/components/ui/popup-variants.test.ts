import { describe, expect, it } from 'vitest';
import { popupSurfaceVariants } from './popup-variants';

describe('popupSurfaceVariants', () => {
  // The surface is a grid. Its one column would otherwise grow to the widest unbreakable
  // content (a long link, a truncated file name), pushing the text and buttons past the
  // popup's right edge, where they are cut off.
  it('keeps popup content to the popup width and wraps long words', () => {
    const classes = popupSurfaceVariants().split(' ');
    expect(classes).toContain('grid-cols-[minmax(0,1fr)]');
    expect(classes).toContain('break-words');
  });
});
