import { describe, it, expect } from 'vitest';
import { blinkingDotStyle, blinkingDotSettingsSchema } from './blinking-dot';
import type { StyleRenderInput } from '../types';
import type { BlinkingDotSettings } from './blinking-dot';

describe('blinkingDotStyle', () => {
  const baseInput: StyleRenderInput<BlinkingDotSettings> = {
    content: { title: 'Test Point' },
    settings: blinkingDotStyle.defaultSettings,
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 0,
    playheadTime: 0,
    pixelRatio: 1,
  };

  it('validates default settings correctly', () => {
    const parsed = blinkingDotSettingsSchema.parse({});
    expect(parsed).toEqual({
      color: '#3b82f6',
      dotRadius: 6,
      blinkSpeed: 1.5,
      showGlow: true,
      glowRadius: 16,
      textColor: '#f8fafc',
      fontFamily: 'Outfit',
      fontSize: 13,
    });
    expect(blinkingDotStyle.defaultSettings).toEqual(parsed);
  });

  it('renders glow, center dot, and text when showGlow is true and title is present', () => {
    const scene = blinkingDotStyle.render(baseInput);
    expect(scene.type).toBe('group');
    if (scene.type !== 'group') return;

    // 1 glow circle + 1 dot circle + 1 text label = 3 children
    expect(scene.children.length).toBe(3);

    // Glow circle
    const glow = scene.children[0];
    expect(glow.type).toBe('circle');
    if (glow.type === 'circle') {
      expect(glow.cx).toBe(0);
      expect(glow.cy).toBe(0);
      expect(glow.r).toBe(16);
      expect(glow.opacity).toBeCloseTo(0.65); // sin(0)=0 -> 0.3 + 0.7 * 0.5 = 0.65
      expect(glow.fill).toBe('rgba(59, 130, 246, 0.25)');
      expect(glow.shadow).toEqual({
        color: '#3b82f6',
        blur: 8,
        offsetX: 0,
        offsetY: 0,
      });
    }

    // Dot circle
    const dot = scene.children[1];
    expect(dot.type).toBe('circle');
    if (dot.type === 'circle') {
      expect(dot.cx).toBe(0);
      expect(dot.cy).toBe(0);
      expect(dot.r).toBe(6);
      expect(dot.fill).toBe('#3b82f6');
      expect(dot.opacity).toBeCloseTo(0.65);
    }

    // Title text
    const label = scene.children[2];
    expect(label.type).toBe('text');
    if (label.type === 'text') {
      expect(label.x).toBe(14); // dotRadius (6) + gap (8) = 14
      expect(label.y).toBe(0);
      expect(label.text).toBe('Test Point');
      expect(label.fontSize).toBe(13);
      expect(label.fontFamily).toBe('Outfit');
      expect(label.fontWeight).toBe(600);
      expect(label.fill).toBe('#f8fafc');
      expect(label.align).toBe('left');
      expect(label.baseline).toBe('middle');
    }
  });

  it('calculates oscillating opacity accurately across itemTime', () => {
    // Peak opacity at sin = 1: t = 1 / (4 * 1.5) = 1 / 6 seconds
    const peakInput: StyleRenderInput<BlinkingDotSettings> = {
      ...baseInput,
      itemTime: 1 / 6,
    };
    const peakScene = blinkingDotStyle.render(peakInput);
    if (peakScene.type === 'group') {
      const dot = peakScene.children[1];
      if (dot.type === 'circle') {
        expect(dot.opacity).toBeCloseTo(1.0);
      }
    }

    // Trough opacity at sin = -1: t = 3 / (4 * 1.5) = 0.5 seconds
    const troughInput: StyleRenderInput<BlinkingDotSettings> = {
      ...baseInput,
      itemTime: 0.5,
    };
    const troughScene = blinkingDotStyle.render(troughInput);
    if (troughScene.type === 'group') {
      const dot = troughScene.children[1];
      if (dot.type === 'circle') {
        expect(dot.opacity).toBeCloseTo(0.3);
      }
    }
  });

  it('omits glow circle when showGlow is false', () => {
    const scene = blinkingDotStyle.render({
      ...baseInput,
      settings: {
        ...baseInput.settings,
        showGlow: false,
      },
    });
    if (scene.type !== 'group') return;

    // 1 dot circle + 1 text label = 2 children
    expect(scene.children.length).toBe(2);
    expect(scene.children[0].type).toBe('circle');
    if (scene.children[0].type === 'circle') {
      expect(scene.children[0].r).toBe(6);
    }
    expect(scene.children[1].type).toBe('text');
  });

  it('omits text node when title is empty', () => {
    const scene = blinkingDotStyle.render({
      ...baseInput,
      content: { title: '' },
    });
    if (scene.type !== 'group') return;

    // 1 glow circle + 1 dot circle = 2 children
    expect(scene.children.length).toBe(2);
    expect(scene.children[0].type).toBe('circle');
    expect(scene.children[1].type).toBe('circle');
  });

  it('measures correctly with and without title', () => {
    const withTitle = blinkingDotStyle.measure(baseInput);
    // dotRadius * 2 + gap + textWidth
    expect(withTitle.width).toBeGreaterThan(6 * 2 + 8);
    expect(withTitle.height).toBe(Math.max(6 * 2 + 16 * 2, 13 * 1.3));

    const withoutTitle = blinkingDotStyle.measure({
      ...baseInput,
      content: { title: '' },
    });
    expect(withoutTitle.width).toBe(6 * 2 + 16 * 2);
    expect(withoutTitle.height).toBe(Math.max(6 * 2 + 16 * 2, 13 * 1.3));
  });

  it('migrates settings gracefully', () => {
    const migrated = blinkingDotStyle.migrate!(1, {
      color: '#10b981',
      dotRadius: 10,
    });
    expect(migrated).toEqual({
      color: '#10b981',
      dotRadius: 10,
      blinkSpeed: 1.5,
      showGlow: true,
      glowRadius: 16,
      textColor: '#f8fafc',
      fontFamily: 'Outfit',
      fontSize: 13,
    });
  });
});
