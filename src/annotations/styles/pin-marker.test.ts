import { describe, it, expect } from 'vitest';
import {
  pinMarkerStyle,
  pinMarkerSettingsSchema,
  defaultPinMarkerSettings,
  getPinPath,
  TITLE_FONT_SIZE,
  TITLE_GAP,
  TITLE_COLOR,
  TITLE_FONT_FAMILY,
} from './pin-marker';
import type { StyleRenderInput } from '../types';
import type { PinMarkerSettings } from './pin-marker';
import { shadows } from '../scene/primitives';

describe('pinMarkerStyle', () => {
  const baseInput: StyleRenderInput<PinMarkerSettings> = {
    content: {
      title: 'Coffee Shop',
      icon: '☕',
    },
    settings: { ...defaultPinMarkerSettings },
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 0,
    playheadTime: 0,
    pixelRatio: 1,
  };

  it('has the correct metadata and configuration', () => {
    expect(pinMarkerStyle.id).toBe('pin-marker');
    expect(pinMarkerStyle.version).toBe(1);
    expect(pinMarkerStyle.name).toBe('Pin Marker');
    expect(pinMarkerStyle.description).toBe('Classic map pin with icon');
    expect(pinMarkerStyle.category).toBe('marker');
    expect(pinMarkerStyle.icon).toBe('map-pin');
    expect(pinMarkerStyle.contentSlots).toEqual(['title', 'icon']);
    expect(pinMarkerStyle.defaultConnector).toEqual({ visible: false });
    expect(pinMarkerStyle.defaultTransition).toEqual({
      enter: 'scale-up',
      exit: 'scale-down',
      enterDuration: 0.3,
      exitDuration: 0.2,
    });
  });

  it('validates settings schema defaults', () => {
    const parsed = pinMarkerSettingsSchema.parse({});
    expect(parsed).toEqual({
      color: '#ef4444',
      size: 36,
      iconSize: 16,
      strokeColor: '#ffffff',
      strokeWidth: 2,
      shadow: true,
    });
    expect(pinMarkerStyle.defaultSettings).toEqual(parsed);
  });

  it('defines the required inspector controls', () => {
    expect(pinMarkerStyle.controls).toEqual([
      { type: 'color', key: 'color', label: 'Pin color' },
      { type: 'slider', key: 'size', label: 'Size', min: 24, max: 64, step: 2, unit: 'px' },
      { type: 'color', key: 'strokeColor', label: 'Border' },
      {
        type: 'slider',
        key: 'strokeWidth',
        label: 'Border width',
        min: 0,
        max: 4,
        step: 0.5,
        unit: 'px',
      },
      { type: 'switch', key: 'shadow', label: 'Drop shadow' },
    ]);
  });

  describe('render', () => {
    it('renders pin path, inner circle, icon text, and title text when all are provided', () => {
      const scene = pinMarkerStyle.render(baseInput);
      expect(scene.type).toBe('group');
      if (scene.type !== 'group') return;

      expect(scene.children).toHaveLength(4);

      // 1. Teardrop path
      const pinBody = scene.children[0];
      expect(pinBody.type).toBe('path');
      if (pinBody.type === 'path') {
        expect(pinBody.d).toBe(getPinPath(36));
        expect(pinBody.fill).toBe('#ef4444');
        expect(pinBody.stroke).toBe('#ffffff');
        expect(pinBody.strokeWidth).toBe(2);
        expect(pinBody.shadow).toEqual(shadows.md);
      }

      // 2. White inner circle
      const r = 36 * 0.35;
      const cy = -(36 - r);
      const innerR = r * 0.65;
      const innerCircle = scene.children[1];
      expect(innerCircle.type).toBe('circle');
      if (innerCircle.type === 'circle') {
        expect(innerCircle.cx).toBe(0);
        expect(innerCircle.cy).toBe(cy);
        expect(innerCircle.r).toBe(innerR);
        expect(innerCircle.fill).toBe('#ffffff');
      }

      // 3. Icon text
      const iconNode = scene.children[2];
      expect(iconNode.type).toBe('text');
      if (iconNode.type === 'text') {
        expect(iconNode.x).toBe(0);
        expect(iconNode.y).toBe(cy);
        expect(iconNode.text).toBe('☕');
        expect(iconNode.fontSize).toBe(16);
        expect(iconNode.align).toBe('center');
        expect(iconNode.baseline).toBe('middle');
      }

      // 4. Title text below anchor
      const titleNode = scene.children[3];
      expect(titleNode.type).toBe('text');
      if (titleNode.type === 'text') {
        expect(titleNode.x).toBe(0);
        expect(titleNode.y).toBe(TITLE_GAP); // 8
        expect(titleNode.text).toBe('Coffee Shop');
        expect(titleNode.fontSize).toBe(TITLE_FONT_SIZE); // 12
        expect(titleNode.fontFamily).toBe(TITLE_FONT_FAMILY);
        expect(titleNode.fontWeight).toBe(600);
        expect(titleNode.fill).toBe(TITLE_COLOR);
        expect(titleNode.align).toBe('center');
        expect(titleNode.baseline).toBe('top');
      }
    });

    it('renders a small center dot circle when no icon is provided', () => {
      const scene = pinMarkerStyle.render({
        ...baseInput,
        content: { title: 'My Location' },
      });
      if (scene.type !== 'group') return;

      expect(scene.children).toHaveLength(4);
      const dotNode = scene.children[2];
      expect(dotNode.type).toBe('circle');
      if (dotNode.type === 'circle') {
        const r = 36 * 0.35;
        const cy = -(36 - r);
        const innerR = r * 0.65;
        expect(dotNode.cx).toBe(0);
        expect(dotNode.cy).toBe(cy);
        expect(dotNode.r).toBeCloseTo(innerR * 0.45);
        expect(dotNode.fill).toBe('#ef4444');
      }
    });

    it('omits title text node when title is missing or empty', () => {
      const sceneWithoutTitle = pinMarkerStyle.render({
        ...baseInput,
        content: { icon: '★' },
      });
      if (sceneWithoutTitle.type !== 'group') return;
      expect(sceneWithoutTitle.children).toHaveLength(3);

      const sceneWithBlankTitle = pinMarkerStyle.render({
        ...baseInput,
        content: { title: '   ', icon: '★' },
      });
      if (sceneWithBlankTitle.type !== 'group') return;
      expect(sceneWithBlankTitle.children).toHaveLength(3);
    });

    it('omits drop shadow when shadow setting is false', () => {
      const scene = pinMarkerStyle.render({
        ...baseInput,
        settings: {
          ...defaultPinMarkerSettings,
          shadow: false,
        },
      });
      if (scene.type !== 'group') return;
      const pinBody = scene.children[0];
      if (pinBody.type === 'path') {
        expect(pinBody.shadow).toBeUndefined();
      }
    });
  });

  describe('measure', () => {
    it('measures width = size * 0.7 + strokeWidth * 2 and height = size when no title', () => {
      const measured = pinMarkerStyle.measure({
        ...baseInput,
        content: { icon: '📍' },
      });
      expect(measured.width).toBeCloseTo(36 * 0.7 + 2 * 2); // 29.2
      expect(measured.height).toBe(36);
    });

    it('includes title fontSize + gap in height when title is present', () => {
      const measured = pinMarkerStyle.measure(baseInput);
      expect(measured.width).toBeCloseTo(36 * 0.7 + 2 * 2);
      expect(measured.height).toBe(36 + TITLE_FONT_SIZE + TITLE_GAP); // 36 + 12 + 8 = 56
    });

    it('scales dimensions correctly with custom size and strokeWidth', () => {
      const customMeasured = pinMarkerStyle.measure({
        ...baseInput,
        settings: {
          ...defaultPinMarkerSettings,
          size: 50,
          strokeWidth: 3,
        },
        content: { icon: '📍' },
      });
      expect(customMeasured.width).toBeCloseTo(50 * 0.7 + 3 * 2); // 41
      expect(customMeasured.height).toBe(50);
    });
  });

  describe('getPinPath', () => {
    it('generates valid closed SVG path starting and ending at origin (0, 0)', () => {
      const pathD = getPinPath(36);
      expect(pathD.startsWith('M 0,0 ')).toBe(true);
      expect(pathD.endsWith(' Z')).toBe(true);
      expect(pathD).toContain(' A ');
    });
  });

  describe('migrate', () => {
    it('preserves valid settings and backfills defaults', () => {
      const migrated = pinMarkerStyle.migrate!(0, {
        color: '#10b981',
        size: 48,
        shadow: false,
      });

      expect(migrated).toEqual({
        color: '#10b981',
        size: 48,
        iconSize: 16,
        strokeColor: '#ffffff',
        strokeWidth: 2,
        shadow: false,
      });
    });

    it('returns defaults for null or invalid inputs', () => {
      expect(pinMarkerStyle.migrate!(0, null)).toEqual(defaultPinMarkerSettings);
      expect(pinMarkerStyle.migrate!(0, undefined)).toEqual(defaultPinMarkerSettings);
      expect(pinMarkerStyle.migrate!(0, 'invalid')).toEqual(defaultPinMarkerSettings);
    });
  });
});
