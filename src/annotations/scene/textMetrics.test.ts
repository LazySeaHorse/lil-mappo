import { describe, it, expect } from 'vitest';
import { buildFont } from './textMetrics';

describe('buildFont', () => {
  it('builds a CSS font shorthand', () => {
    expect(buildFont(22, 'Barlow Condensed', 600)).toBe("600 22px 'Barlow Condensed', sans-serif");
    expect(buildFont(14, 'Outfit')).toBe("400 14px 'Outfit', sans-serif");
  });

  it('puts the italic style first so the italic face is requested', () => {
    expect(buildFont(20, 'Fraunces', 700, 'italic')).toBe("italic 700 20px 'Fraunces', sans-serif");
    expect(buildFont(20, 'Fraunces', 700, 'normal')).toBe("700 20px 'Fraunces', sans-serif");
  });
});
