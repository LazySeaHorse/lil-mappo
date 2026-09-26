import { describe, it, expect } from 'vitest';
import { rippleMarkerStyle, rippleMarkerSettingsSchema } from './ripple-marker';
import type { StyleRenderInput } from '../types';
import type { RippleMarkerSettings } from './ripple-marker';

describe('rippleMarkerStyle', () => {
  const baseInput: StyleRenderInput<RippleMarkerSettings> = {
    content: { title: 'Test Point' },
    settings: rippleMarkerStyle.defaultSettings,
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 0,
    playheadTime: 0,
    pixelRatio: 1,
  };

  it('validates default settings correctly', () => {
    const parsed = rippleMarkerSettingsSchema.parse({});
    expect(parsed).toEqual({
      color: '#3b82f6',
      dotRadius: 5,
      rippleRadius: 30,
      rippleSpeed: 0.8,
      rippleCount: 2,
      strokeWidth: 2,
      textColor: '#f8fafc',
      fontFamily: 'Outfit',
      fontSize: 13,
    });
    expect(rippleMarkerStyle.defaultSettings).toEqual(parsed);
  });

  it('renders ripple rings, center dot, and label text when title is present', () => {
    const scene = rippleMarkerStyle.render(baseInput);
    expect(scene.type).toBe('group');
    if (scene.type !== 'group') return;

    // 2 ripple rings + 1 center dot + 1 text label = 4 children
    expect(scene.children.length).toBe(4);

    // Ripple rings (circles without fill, with stroke and opacity)
    const ring1 = scene.children[0];
    const ring2 = scene.children[1];
    expect(ring1.type).toBe('circle');
    expect(ring2.type).toBe('circle');

    if (ring1.type === 'circle' && ring2.type === 'circle') {
      // Ring 1 at itemTime=0, i=0: phase = 0
      // radius = dotRadius (5), opacity = (1 - 0) * 0.6 = 0.6
      expect(ring1.cx).toBe(0);
      expect(ring1.cy).toBe(0);
      expect(ring1.r).toBe(5);
      expect(ring1.stroke).toBe('#3b82f6');
      expect(ring1.strokeWidth).toBe(2);
      expect(ring1.opacity).toBeCloseTo(0.6);
      expect(ring1.fill).toBeUndefined();

      // Ring 2 at itemTime=0, i=1: phase = 0.5
      // radius = 5 + 0.5 * (30 - 5) = 17.5, opacity = (1 - 0.5) * 0.6 = 0.3
      expect(ring2.cx).toBe(0);
      expect(ring2.cy).toBe(0);
      expect(ring2.r).toBe(17.5);
      expect(ring2.stroke).toBe('#3b82f6');
      expect(ring2.strokeWidth).toBe(2);
      expect(ring2.opacity).toBeCloseTo(0.3);
      expect(ring2.fill).toBeUndefined();
    }

    // Center dot (circle with fill, no stroke)
    const dot = scene.children[2];
    expect(dot.type).toBe('circle');
    if (dot.type === 'circle') {
      expect(dot.cx).toBe(0);
      expect(dot.cy).toBe(0);
      expect(dot.r).toBe(5);
      expect(dot.fill).toBe('#3b82f6');
    }

    // Label text
    const label = scene.children[3];
    expect(label.type).toBe('text');
    if (label.type === 'text') {
      expect(label.x).toBe(38); // rippleRadius (30) + 8 gap = 38
      expect(label.y).toBe(0);
      expect(label.text).toBe('Test Point');
      expect(label.fill).toBe('#f8fafc');
      expect(label.fontSize).toBe(13);
      expect(label.fontFamily).toBe('Outfit');
      expect(label.align).toBe('left');
      expect(label.baseline).toBe('middle');
    }
  });

  it('renders only rings and dot when title is empty or missing', () => {
    const scene = rippleMarkerStyle.render({
      ...baseInput,
      content: { title: '' },
    });
    if (scene.type !== 'group') return;
    expect(scene.children.length).toBe(3); // 2 rings + 1 dot
  });

  it('adjusts ring count dynamically based on settings', () => {
    const scene = rippleMarkerStyle.render({
      ...baseInput,
      settings: {
        ...baseInput.settings,
        rippleCount: 4,
      },
    });
    if (scene.type !== 'group') return;
    expect(scene.children.length).toBe(6); // 4 rings + 1 dot + 1 text
  });

  it('measures dimensions correctly with and without title', () => {
    const sizeWithTitle = rippleMarkerStyle.measure(baseInput);
    expect(sizeWithTitle.height).toBe(60); // rippleRadius (30) * 2
    expect(sizeWithTitle.width).toBeGreaterThan(60); // baseDiameter (60) + gap (8) + textWidth

    const sizeWithoutTitle = rippleMarkerStyle.measure({
      ...baseInput,
      content: { title: '' },
    });
    expect(sizeWithoutTitle.height).toBe(60);
    expect(sizeWithoutTitle.width).toBe(60);
  });

  it('migrates older settings properly', () => {
    const migrated = rippleMarkerStyle.migrate!(0, {
      color: '#ff0000',
      dotRadius: 8,
    });
    expect(migrated.color).toBe('#ff0000');
    expect(migrated.dotRadius).toBe(8);
    expect(migrated.rippleRadius).toBe(30);
    expect(migrated.rippleSpeed).toBe(0.8);
  });
});
