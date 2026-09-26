import { describe, it, expect } from 'vitest';
import {
  standardCardStyle,
  standardCardSettingsSchema,
  defaultStandardCardSettings,
  measureStandardCard,
  renderStandardCard,
} from './standard-card';
import type { StyleRenderInput } from '../types';
import { shadows } from '../scene/primitives';

describe('standardCardStyle', () => {
  const baseInput: StyleRenderInput<typeof defaultStandardCardSettings> = {
    content: {
      title: 'Hello World',
    },
    settings: { ...defaultStandardCardSettings },
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 0,
    playheadTime: 0,
    pixelRatio: 1,
  };

  it('has the correct metadata and defaults', () => {
    expect(standardCardStyle.id).toBe('standard-card');
    expect(standardCardStyle.version).toBe(1);
    expect(standardCardStyle.name).toBe('Standard Card');
    expect(standardCardStyle.description).toBe('Simple card with title text');
    expect(standardCardStyle.category).toBe('card');
    expect(standardCardStyle.icon).toBe('square');
    expect(standardCardStyle.contentSlots).toEqual(['title']);
    expect(standardCardStyle.defaultConnector).toEqual({ visible: true });
  });

  it('validates settings schema with defaults', () => {
    const parsed = standardCardSettingsSchema.parse({});
    expect(parsed).toEqual({
      bgColor: '#0f172a',
      textColor: '#f8fafc',
      fontFamily: 'Outfit',
      borderRadius: 8,
      maxWidth: 240,
      shadow: true,
    });
  });

  it('defines all required inspector controls with exact properties', () => {
    expect(standardCardStyle.controls).toEqual([
      { type: 'color', key: 'bgColor', label: 'Background' },
      { type: 'color', key: 'textColor', label: 'Text color' },
      { type: 'font', key: 'fontFamily', label: 'Font' },
      { type: 'slider', key: 'borderRadius', label: 'Corner radius', min: 0, max: 24, step: 1, unit: 'px' },
      { type: 'slider', key: 'maxWidth', label: 'Max width', min: 120, max: 400, step: 5, unit: 'px' },
      { type: 'switch', key: 'shadow', label: 'Drop shadow' },
    ]);
  });

  describe('measure', () => {
    it('measures dimensions based on title length and maxWidth', () => {
      // 'Hello World' has 11 chars: 11 * 8 + 24 = 112
      // Height: 14 * 1.4 + 16 = 35.6
      const dims = standardCardStyle.measure(baseInput);
      expect(dims.width).toBe(112);
      expect(dims.height).toBeCloseTo(35.6);
    });

    it('clamps width to maxWidth when text is long', () => {
      const longInput: StyleRenderInput<typeof defaultStandardCardSettings> = {
        ...baseInput,
        content: {
          title: 'This is a very long annotation title that should be clamped to maxWidth',
        },
      };
      const dims = standardCardStyle.measure(longInput);
      expect(dims.width).toBe(240);
      expect(dims.height).toBeCloseTo(35.6);
    });

    it('handles empty or missing title gracefully', () => {
      const emptyInput: StyleRenderInput<typeof defaultStandardCardSettings> = {
        ...baseInput,
        content: { title: '' },
      };
      const dims = standardCardStyle.measure(emptyInput);
      expect(dims.width).toBe(24); // 0 * 8 + 24
      expect(dims.height).toBeCloseTo(35.6);
    });
  });

  describe('render', () => {
    it('renders rounded rect background and centered title text', () => {
      const node = standardCardStyle.render(baseInput);
      expect(node.type).toBe('group');
      if (node.type !== 'group') return;

      expect(node.children).toHaveLength(2);
      const [rectNode, textNode] = node.children;

      // 1. Rect node
      expect(rectNode.type).toBe('rect');
      if (rectNode.type === 'rect') {
        const expectedW = 112;
        const expectedH = 14 * 1.4 + 16;
        expect(rectNode.width).toBe(expectedW);
        expect(rectNode.height).toBeCloseTo(expectedH);
        expect(rectNode.x).toBe(-expectedW / 2);
        expect(rectNode.y).toBeCloseTo(-expectedH);
        expect(rectNode.fill).toBe('#0f172a');
        expect(rectNode.stroke).toBe('rgba(255, 255, 255, 0.2)');
        expect(rectNode.strokeWidth).toBe(1);
        expect(rectNode.cornerRadius).toBe(8);
        expect(rectNode.shadow).toEqual(shadows.md);
      }

      // 2. Text node
      expect(textNode.type).toBe('text');
      if (textNode.type === 'text') {
        const expectedH = 14 * 1.4 + 16;
        expect(textNode.text).toBe('Hello World');
        expect(textNode.fontSize).toBe(14);
        expect(textNode.fontFamily).toBe('Outfit');
        expect(textNode.fontWeight).toBe(600);
        expect(textNode.fill).toBe('#f8fafc');
        expect(textNode.align).toBe('center');
        expect(textNode.baseline).toBe('middle');
        expect(textNode.x).toBe(0);
        expect(textNode.y).toBeCloseTo(-expectedH / 2);
        expect(textNode.maxWidth).toBe(112 - 24);
      }
    });

    it('omits shadow when shadow setting is false', () => {
      const noShadowInput = {
        ...baseInput,
        settings: {
          ...defaultStandardCardSettings,
          shadow: false,
        },
      };
      const node = standardCardStyle.render(noShadowInput);
      if (node.type === 'group') {
        const rectNode = node.children[0];
        if (rectNode.type === 'rect') {
          expect(rectNode.shadow).toBeUndefined();
        }
      }
    });
  });

  describe('migration', () => {
    it('migrates older settings preserving matching fields', () => {
      const migrated = standardCardStyle.migrate!(0, {
        bgColor: '#123456',
        textColor: '#abcdef',
        fontFamily: 'Inter',
        borderRadius: 12,
        maxWidth: 300,
        shadow: false,
        extraLegacyField: true,
      });

      expect(migrated).toEqual({
        bgColor: '#123456',
        textColor: '#abcdef',
        fontFamily: 'Inter',
        borderRadius: 12,
        maxWidth: 300,
        shadow: false,
      });
    });

    it('falls back to defaults for invalid or null settings', () => {
      expect(standardCardStyle.migrate!(0, null)).toEqual(defaultStandardCardSettings);
      expect(standardCardStyle.migrate!(0, 'invalid')).toEqual(defaultStandardCardSettings);
    });
  });
});
