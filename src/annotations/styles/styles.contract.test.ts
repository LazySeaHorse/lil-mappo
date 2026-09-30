/**
 * Contract every registered style must meet. It runs over the registry, so a
 * new style is covered as soon as it is registered in styles/index.ts.
 */

import { describe, it, expect } from 'vitest';
import '@/annotations/styles';
import { getAllStyles } from '../registry';
import { STYLE_ICONS, isStyleIconName } from '../inspector/styleIcons';
import { measureScene } from '../scene/measure';
import { STYLE_ANIMATION } from '../animation';
import type { AnnotationContent, AnnotationStyleDefinition, StyleRenderInput } from '../types';

const CATEGORIES = ['label', 'marker', 'editorial', 'data', 'media', 'sign'];
const CONTENT_KEYS: Array<keyof AnnotationContent> = [
  'title', 'subtitle', 'eyebrow', 'body', 'icon', 'image', 'badge', 'metric',
];

const content: AnnotationContent = {
  title: 'Harbour Bridge',
  subtitle: 'Sydney, Australia',
  eyebrow: '33.85° S, 151.21° E',
  body: 'A steel through arch bridge across Sydney Harbour.',
  badge: 'NEW',
  metric: { value: 1234.5, label: 'Length', unit: 'm' },
};

function inputFor(
  style: AnnotationStyleDefinition,
  overrides: Partial<StyleRenderInput> = {},
): StyleRenderInput {
  return {
    content,
    settings: style.settingsSchema.parse({}) as Record<string, unknown>,
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 3,
    playheadTime: 3,
    ground: { x: -70, y: 90 },
    pixelRatio: 1,
    ...overrides,
  };
}

const styles = getAllStyles();

describe('registered styles', () => {
  it('include at least Leader Line, with unique ids', () => {
    expect(styles.map((s) => s.id)).toContain('leader-line');
    expect(new Set(styles.map((s) => s.id)).size).toBe(styles.length);
  });

  describe.each(styles.map((s) => [s.id, s] as const))('%s', (_id, style) => {
    it('has valid metadata', () => {
      expect(style.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(style.name.length).toBeGreaterThan(0);
      expect(style.description.length).toBeGreaterThan(0);
      expect(CATEGORIES).toContain(style.category);
      expect(isStyleIconName(style.icon), `icon "${style.icon}" must be in STYLE_ICONS`).toBe(true);
      expect(Object.keys(STYLE_ICONS)).toContain(style.icon);
      expect(style.contentSlots.length).toBeGreaterThan(0);
      for (const slot of style.contentSlots) expect(CONTENT_KEYS).toContain(slot);
      expect(style.version).toBeGreaterThanOrEqual(1);
    });

    it('has default settings its schema accepts, and controls that point at real settings', () => {
      expect(style.settingsSchema.parse({})).toEqual(style.defaultSettings);
      expect(style.settingsSchema.parse(style.defaultSettings)).toEqual(style.defaultSettings);
      const keys = Object.keys(style.defaultSettings as object);
      for (const control of style.controls) {
        expect(keys, `control "${control.key}"`).toContain(control.key);
        if (control.type === 'select') {
          expect(control.options.map((o) => o.value)).toContain((style.defaultSettings as Record<string, unknown>)[control.key]);
        }
      }
    });

    it('renders and measures every phase without throwing', () => {
      for (const [phase, progress] of [['enter', 0], ['enter', 0.5], ['enter', 1], ['visible', 1], ['exit', 0.5], ['exit', 1]] as const) {
        const input = inputFor(style, { phase, phaseProgress: progress });
        expect(() => measureScene(style.render(input))).not.toThrow();
        const bounds = style.measure(input);
        for (const value of Object.values(bounds)) expect(Number.isFinite(value)).toBe(true);
      }
    });

    it('measures the finished state, whatever phase it is asked in', () => {
      const finished = style.measure(inputFor(style));
      expect(finished.width).toBeGreaterThan(0);
      expect(finished.height).toBeGreaterThan(0);
      expect(style.measure(inputFor(style, { phase: 'enter', phaseProgress: 0 }))).toEqual(finished);
      expect(style.measure(inputFor(style, { phase: 'exit', phaseProgress: 0.6 }))).toEqual(finished);
    });

    it('measures a box that contains everything the finished state draws', () => {
      const bounds = style.measure(inputFor(style));
      const drawn = measureScene(style.render(inputFor(style)));
      const slack = 0.5;
      expect(bounds.x).toBeLessThanOrEqual(drawn.minX + slack);
      expect(bounds.y).toBeLessThanOrEqual(drawn.minY + slack);
      expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(drawn.maxX - slack);
      expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(drawn.maxY - slack);
    });

    it('reaches the ground point when it draws its own connector', () => {
      if (!style.drawsConnector) return;
      const { x, y, width, height } = style.measure(inputFor(style));
      expect(x).toBeLessThanOrEqual(-70);
      expect(x + width).toBeGreaterThanOrEqual(-70);
      expect(y).toBeLessThanOrEqual(90);
      expect(y + height).toBeGreaterThanOrEqual(90);
    });

    it('is deterministic for a given input', () => {
      const input = inputFor(style, { phase: 'enter', phaseProgress: 0.37, itemTime: 0.44 });
      expect(style.render(input)).toEqual(style.render(input));
    });

    it('ends its entrance in exactly its finished state, and starts its exit from it', () => {
      const finished = style.render(inputFor(style));
      expect(style.render(inputFor(style, { phase: 'enter', phaseProgress: 1 }))).toEqual(finished);
      expect(style.render(inputFor(style, { phase: 'exit', phaseProgress: 0 }))).toEqual(finished);
    });

    it('declares consistent choreography defaults', () => {
      const { enter, exit } = style.defaultTransition ?? {};
      if (enter === STYLE_ANIMATION || exit === STYLE_ANIMATION) {
        expect(style.defaultTransition?.enterDuration).toBeGreaterThan(0);
        expect(style.defaultTransition?.exitDuration).toBeGreaterThan(0);
      }
      if (style.drawsConnector) expect(style.defaultOffset).toBeDefined();
    });
  });
});
