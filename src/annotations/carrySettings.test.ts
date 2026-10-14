import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { carrySettings } from './carrySettings';
import type { AnnotationStyleDefinition, ControlDefinition } from './types';

/** A bare style with the given controls and defaults; its schema accepts anything. */
function fakeStyle(
  controls: ControlDefinition[],
  defaultSettings: Record<string, unknown>,
  schema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown()),
): AnnotationStyleDefinition {
  return { id: 'fake', controls, defaultSettings, settingsSchema: schema } as unknown as AnnotationStyleDefinition;
}

describe('carrySettings', () => {
  it('keeps a value whose key and control type exist in both styles', () => {
    const from = fakeStyle([{ type: 'color', key: 'accent', label: 'A' }], { accent: '#111111' });
    const to = fakeStyle([{ type: 'color', key: 'accent', label: 'Accent' }], { accent: '#ffffff' });
    expect(carrySettings(from, { accent: '#ff0000' }, to)).toEqual({ accent: '#ff0000' });
  });

  it('resets a key the new style does not have, and takes defaults for new keys', () => {
    const from = fakeStyle([{ type: 'color', key: 'old', label: 'Old' }], { old: '#111111' });
    const to = fakeStyle([{ type: 'color', key: 'fresh', label: 'Fresh' }], { fresh: '#222222' });
    expect(carrySettings(from, { old: '#ff0000' }, to)).toEqual({ fresh: '#222222' });
  });

  it('resets a key whose control type differs', () => {
    const from = fakeStyle([{ type: 'switch', key: 'size', label: 'Size' }], { size: false });
    const to = fakeStyle([{ type: 'slider', key: 'size', label: 'Size', min: 0, max: 10, step: 1 }], { size: 4 });
    expect(carrySettings(from, { size: true }, to)).toEqual({ size: 4 });
  });

  it('clamps a slider value to the new range and keeps it on the step grid', () => {
    const slider = (max: number): ControlDefinition => ({ type: 'slider', key: 'size', label: 'Size', min: 20, max, step: 5 });
    const from = fakeStyle([slider(200)], { size: 100 });
    const to = fakeStyle([slider(60)], { size: 40 });
    expect(carrySettings(from, { size: 150 }, to)).toEqual({ size: 60 });
    expect(carrySettings(from, { size: 12 }, to)).toEqual({ size: 20 });
    expect(carrySettings(from, { size: 33 }, to)).toEqual({ size: 35 });
    expect(carrySettings(from, { size: 'wide' }, to)).toEqual({ size: 40 });
  });

  it('keeps a select value only when the new style offers that option', () => {
    const select = (values: string[]): ControlDefinition => ({
      type: 'select', key: 'side', label: 'Side', options: values.map((value) => ({ value, label: value })),
    });
    const from = fakeStyle([select(['auto', 'left', 'right'])], { side: 'auto' });
    const to = fakeStyle([select(['auto', 'left'])], { side: 'auto' });
    expect(carrySettings(from, { side: 'left' }, to)).toEqual({ side: 'left' });
    expect(carrySettings(from, { side: 'right' }, to)).toEqual({ side: 'auto' });
  });

  it('keeps switch, font and text values', () => {
    const controls: ControlDefinition[] = [
      { type: 'switch', key: 'pulse', label: 'Pulse' },
      { type: 'font', key: 'font', label: 'Font' },
      { type: 'text-input', key: 'prefix', label: 'Prefix' },
    ];
    const defaults = { pulse: true, font: 'Outfit', prefix: '' };
    const settings = { pulse: false, font: 'Lora', prefix: '$' };
    expect(carrySettings(fakeStyle(controls, defaults), settings, fakeStyle(controls, defaults))).toEqual(settings);
  });

  it('drops a kept value the new style schema rejects', () => {
    const controls: ControlDefinition[] = [{ type: 'color', key: 'accent', label: 'Accent' }];
    const from = fakeStyle(controls, { accent: '#111111' });
    const to = fakeStyle(controls, { accent: '#ffffff' }, z.object({ accent: z.string().regex(/^#[0-9a-f]{6}$/i) }));
    expect(carrySettings(from, { accent: 'red' }, to)).toEqual({ accent: '#ffffff' });
  });

  it('gives plain defaults when the old style is unknown', () => {
    const to = fakeStyle([{ type: 'color', key: 'accent', label: 'Accent' }], { accent: '#ffffff' });
    expect(carrySettings(undefined, { accent: '#ff0000' }, to)).toEqual({ accent: '#ffffff' });
  });

  it('returns a new object, never the defaults object of the style', () => {
    const to = fakeStyle([], { accent: '#ffffff' });
    expect(carrySettings(undefined, {}, to)).not.toBe(to.defaultSettings);
  });
});
