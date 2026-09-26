import { describe, it, expect, vi } from 'vitest';
import { newsSlugStyle, newsSlugSettingsSchema } from './news-slug';
import type { StyleRenderInput } from '../types';
import { measureScene } from '../scene/measure';
import { renderScene } from '../scene/renderer';
import { shadows } from '../scene/primitives';

describe('newsSlugStyle', () => {
  const baseInput: StyleRenderInput<typeof newsSlugStyle.defaultSettings> = {
    content: {
      title: 'Breaking News',
    },
    settings: { ...newsSlugStyle.defaultSettings },
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 0,
    playheadTime: 0,
    pixelRatio: 1,
  };

  it('has the correct metadata and defaults', () => {
    expect(newsSlugStyle.id).toBe('news-slug');
    expect(newsSlugStyle.version).toBe(1);
    expect(newsSlugStyle.name).toBe('News Slug');
    expect(newsSlugStyle.description).toBe('Bold news-style banner with accent bar');
    expect(newsSlugStyle.category).toBe('editorial');
    expect(newsSlugStyle.icon).toBe('flag');
    expect(newsSlugStyle.contentSlots).toEqual(['title']);
    expect(newsSlugStyle.defaultConnector).toEqual({ visible: false });
  });

  it('validates settings with default values', () => {
    const parsed = newsSlugSettingsSchema.parse({});
    expect(parsed).toEqual({
      bgColor: '#0f172a',
      textColor: '#f8fafc',
      accentColor: '#ef4444',
      fontFamily: 'Outfit',
      shadow: true,
    });
  });

  it('defines all required inspector controls', () => {
    expect(newsSlugStyle.controls).toEqual([
      { type: 'color', key: 'bgColor', label: 'Background' },
      { type: 'color', key: 'textColor', label: 'Text color' },
      { type: 'color', key: 'accentColor', label: 'Accent bar' },
      { type: 'font', key: 'fontFamily', label: 'Font' },
      { type: 'switch', key: 'shadow', label: 'Drop shadow' },
    ]);
  });

  it('measures dimensions accurately according to specification', () => {
    const dims = newsSlugStyle.measure(baseInput);
    // Height should be 16 * 1.2 + 8 * 2 = 35.2
    expect(dims.height).toBeCloseTo(35.2);
    // Width should include accent bar (5px) + padH * 2 (32px) + text width (> 0)
    expect(dims.width).toBeGreaterThan(37);
  });

  it('renders correct scene nodes structure and properties', () => {
    const scene = newsSlugStyle.render(baseInput);
    expect(scene.type).toBe('group');
    if (scene.type !== 'group') return;

    expect(scene.children.length).toBe(3);

    const [bgRect, accentBar, titleText] = scene.children;

    // 1. Background Rect
    expect(bgRect.type).toBe('rect');
    if (bgRect.type === 'rect') {
      expect(bgRect.fill).toBe('#0f172a');
      expect(bgRect.shadow).toEqual(shadows.md);
      expect(bgRect.cornerRadius).toBeUndefined();
      expect(bgRect.height).toBeCloseTo(35.2);
      expect(bgRect.y).toBeCloseTo(-35.2);
    }

    // 2. Accent Bar Rect
    expect(accentBar.type).toBe('rect');
    if (accentBar.type === 'rect') {
      expect(accentBar.width).toBe(5);
      expect(accentBar.fill).toBe('#ef4444');
      expect(accentBar.height).toBeCloseTo(35.2);
      expect(accentBar.y).toBeCloseTo(-35.2);
    }

    // 3. Title Text
    expect(titleText.type).toBe('text');
    if (titleText.type === 'text') {
      expect(titleText.text).toBe('BREAKING NEWS');
      expect(titleText.fontSize).toBe(16);
      expect(titleText.fontWeight).toBe(900);
      expect(titleText.fontFamily).toBe('Outfit');
      expect(titleText.letterSpacing).toBe('-0.02em');
      expect(titleText.textTransform).toBe('uppercase');
      expect(titleText.align).toBe('left');
      expect(titleText.baseline).toBe('middle');
      expect(titleText.fill).toBe('#f8fafc');
    }
  });

  it('omits shadow when shadow setting is false', () => {
    const noShadowInput = {
      ...baseInput,
      settings: {
        ...newsSlugStyle.defaultSettings,
        shadow: false,
      },
    };
    const scene = newsSlugStyle.render(noShadowInput);
    if (scene.type === 'group') {
      const bgRect = scene.children[0];
      if (bgRect.type === 'rect') {
        expect(bgRect.shadow).toBeUndefined();
      }
    }
  });

  it('works with measureScene and renderScene', () => {
    const scene = newsSlugStyle.render(baseInput);
    const box = measureScene(scene);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
      setLineDash: vi.fn(),
      globalAlpha: 1,
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'top',
    } as unknown as CanvasRenderingContext2D;

    expect(() => renderScene(mockCtx, scene)).not.toThrow();
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
    expect(mockCtx.fillRect).toHaveBeenCalledTimes(2);
    expect(mockCtx.fillText).toHaveBeenCalledTimes(1);
  });

  it('supports migration from older settings', () => {
    expect(newsSlugStyle.migrate).toBeDefined();
    const migrated = newsSlugStyle.migrate!(1, {
      bgColor: '#123456',
      textColor: '#ffffff',
    });
    expect(migrated).toEqual({
      bgColor: '#123456',
      textColor: '#ffffff',
      accentColor: '#ef4444',
      fontFamily: 'Outfit',
      shadow: true,
    });
  });
});
