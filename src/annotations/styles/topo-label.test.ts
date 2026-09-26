import { describe, it, expect, vi } from 'vitest';
import {
  topoLabelStyle,
  topoLabelSettingsSchema,
  defaultTopoLabelSettings,
} from './topo-label';
import type { StyleRenderInput } from '../types';
import { measureScene } from '../scene/measure';
import { renderScene } from '../scene/renderer';

describe('topoLabelStyle', () => {
  const baseInputWithMeta: StyleRenderInput<typeof defaultTopoLabelSettings> = {
    content: {
      title: 'Mount Rainier',
      eyebrow: '46.8523° N, 121.7603° W',
      body: 'ELEV: 14411ft',
    },
    settings: { ...defaultTopoLabelSettings },
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 0,
    playheadTime: 0,
    pixelRatio: 1,
  };

  const baseInputWithoutMeta: StyleRenderInput<typeof defaultTopoLabelSettings> = {
    content: {
      title: 'Mount Rainier',
      eyebrow: '46.8523° N, 121.7603° W',
      body: 'ELEV: 14411ft',
    },
    settings: {
      ...defaultTopoLabelSettings,
      showMetadata: false,
    },
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 0,
    playheadTime: 0,
    pixelRatio: 1,
  };

  it('has the correct metadata and defaults', () => {
    expect(topoLabelStyle.id).toBe('topo-label');
    expect(topoLabelStyle.version).toBe(1);
    expect(topoLabelStyle.name).toBe('Topographic');
    expect(topoLabelStyle.description).toBe(
      'Military-style label with coordinates and elevation',
    );
    expect(topoLabelStyle.category).toBe('data');
    expect(topoLabelStyle.icon).toBe('mountain');
    expect(topoLabelStyle.contentSlots).toEqual(['title']);
    expect(topoLabelStyle.defaultConnector).toEqual({
      visible: true,
      style: 'solid',
      endDot: false,
    });
  });

  it('validates settings schema with defaults', () => {
    const parsed = topoLabelSettingsSchema.parse({});
    expect(parsed).toEqual({
      textColor: '#f8fafc',
      accentColor: '#3b82f6',
      fontFamily: 'Outfit',
      showMetadata: true,
    });
    expect(topoLabelStyle.defaultSettings).toEqual(parsed);
  });

  it('defines all required inspector controls', () => {
    expect(topoLabelStyle.controls).toEqual([
      { type: 'color', key: 'textColor', label: 'Text color' },
      { type: 'color', key: 'accentColor', label: 'Accent color' },
      { type: 'font', key: 'fontFamily', label: 'Font' },
      { type: 'switch', key: 'showMetadata', label: 'Show coordinates & elevation' },
    ]);
  });

  it('measures dimensions accurately when showMetadata is true', () => {
    const dims = topoLabelStyle.measure(baseInputWithMeta);
    // Height: padV (4) + coord (9+4) + title (14*1.3) + elev (4+1+4+10) + padV (4) = 58.2
    expect(dims.height).toBeCloseTo(58.2);
    // Width should include left border (1px) + padLeft (12px) + contentW (> 0) + padRight (8px)
    expect(dims.width).toBeGreaterThan(21);
  });

  it('measures dimensions accurately when showMetadata is false', () => {
    const dims = topoLabelStyle.measure(baseInputWithoutMeta);
    // Height: padV (4) + title (14*1.3) + padV (4) = 26.2
    expect(dims.height).toBeCloseTo(26.2);
    expect(dims.width).toBeGreaterThan(21);
  });

  it('renders 6 scene nodes when showMetadata is true', () => {
    const scene = topoLabelStyle.render(baseInputWithMeta);
    expect(scene.type).toBe('group');
    if (scene.type !== 'group') return;

    expect(scene.children.length).toBe(6);

    const [leftBorder, coords, title, separator, elevation, square] =
      scene.children;

    // 1. Left border line (white 30% opacity)
    expect(leftBorder.type).toBe('line');
    if (leftBorder.type === 'line') {
      expect(leftBorder.stroke).toBe('rgba(255, 255, 255, 0.3)');
      expect(leftBorder.strokeWidth).toBe(1);
    }

    // 2. Coordinates line (content.eyebrow) in accent color, 9px, weight 700, 0.05em
    expect(coords.type).toBe('text');
    if (coords.type === 'text') {
      expect(coords.text).toBe('46.8523° N, 121.7603° W');
      expect(coords.fontSize).toBe(9);
      expect(coords.fontWeight).toBe(700);
      expect(coords.letterSpacing).toBe('0.05em');
      expect(coords.fill).toBe('#3b82f6');
      expect(coords.baseline).toBe('top');
    }

    // 3. Title in uppercase, weight 700, size 14px
    expect(title.type).toBe('text');
    if (title.type === 'text') {
      expect(title.text).toBe('MOUNT RAINIER');
      expect(title.fontSize).toBe(14);
      expect(title.fontWeight).toBe(700);
      expect(title.textTransform).toBe('uppercase');
      expect(title.fill).toBe('#f8fafc');
      expect(title.baseline).toBe('top');
    }

    // 4. Thin separator line (white 10% opacity)
    expect(separator.type).toBe('line');
    if (separator.type === 'line') {
      expect(separator.stroke).toBe('rgba(255, 255, 255, 0.1)');
      expect(separator.strokeWidth).toBe(1);
    }

    // 5. Elevation (content.body) at 50% opacity, size 10px
    expect(elevation.type).toBe('text');
    if (elevation.type === 'text') {
      expect(elevation.text).toBe('ELEV: 14411ft');
      expect(elevation.fontSize).toBe(10);
      expect(elevation.fontWeight).toBe(400);
      expect(elevation.fill).toBe('#f8fafc');
      expect(elevation.opacity).toBe(0.5);
      expect(elevation.baseline).toBe('top');
    }

    // 6. 4x4 accent-colored square outline at bottom-left
    expect(square.type).toBe('rect');
    if (square.type === 'rect') {
      expect(square.width).toBe(4);
      expect(square.height).toBe(4);
      expect(square.stroke).toBe('#3b82f6');
      expect(square.strokeWidth).toBe(1);
      expect(square.fill).toBeUndefined();
    }
  });

  it('renders 2 scene nodes when showMetadata is false', () => {
    const scene = topoLabelStyle.render(baseInputWithoutMeta);
    expect(scene.type).toBe('group');
    if (scene.type !== 'group') return;

    expect(scene.children.length).toBe(2);

    const [leftBorder, title] = scene.children;

    // 1. Left border
    expect(leftBorder.type).toBe('line');
    if (leftBorder.type === 'line') {
      expect(leftBorder.stroke).toBe('rgba(255, 255, 255, 0.3)');
      expect(leftBorder.strokeWidth).toBe(1);
    }

    // 2. Uppercase title only
    expect(title.type).toBe('text');
    if (title.type === 'text') {
      expect(title.text).toBe('MOUNT RAINIER');
      expect(title.fontSize).toBe(14);
      expect(title.fontWeight).toBe(700);
      expect(title.textTransform).toBe('uppercase');
      expect(title.fill).toBe('#f8fafc');
      expect(title.baseline).toBe('top');
    }
  });

  it('migrates older settings properly', () => {
    if (!topoLabelStyle.migrate) {
      throw new Error('migrate function not defined');
    }
    const legacy = {
      accentColor: '#10b981',
      showMetadata: false,
      textColor: '#e2e8f0',
      fontFamily: 'Inter',
    };
    const migrated = topoLabelStyle.migrate(1, legacy);
    expect(migrated).toEqual({
      textColor: '#e2e8f0',
      accentColor: '#10b981',
      fontFamily: 'Inter',
      showMetadata: false,
    });

    const fallback = topoLabelStyle.migrate(1, null);
    expect(fallback).toEqual(defaultTopoLabelSettings);
  });

  it('works with measureScene and renderScene', () => {
    const scene = topoLabelStyle.render(baseInputWithMeta);
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
      strokeRect: vi.fn(),
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
    expect(mockCtx.moveTo).toHaveBeenCalled();
    expect(mockCtx.lineTo).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalledTimes(3);
    expect(mockCtx.strokeRect).toHaveBeenCalledTimes(1);
  });
});
