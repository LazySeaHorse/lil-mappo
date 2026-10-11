import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { registerStyle, validateSettings } from './registry';
import { group } from './scene/primitives';
import type { AnnotationStyleDefinition } from './types';

function makeStyle(id: string, schema: z.ZodTypeAny, defaults: Record<string, unknown>): AnnotationStyleDefinition {
  return {
    id,
    name: id,
    category: 'label',
    version: 1,
    description: '',
    contentSlots: ['title'],
    settingsSchema: schema,
    defaultSettings: defaults,
    controls: [],
    defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1 },
    render: () => group({ children: [] }),
    measure: () => ({ x: 0, y: 0, width: 1, height: 1 }),
  } as unknown as AnnotationStyleDefinition;
}

describe('validateSettings', () => {
  const schema = z.object({ color: z.string().default('#000') });
  registerStyle(makeStyle('registry-test', schema, { color: '#000' }));

  it('fills defaults, and falls back to the defaults for invalid settings', () => {
    expect(validateSettings('registry-test', {})).toEqual({ color: '#000' });
    expect(validateSettings('registry-test', { color: '#fff' })).toEqual({ color: '#fff' });
    expect(validateSettings('registry-test', { color: 3 })).toEqual({ color: '#000' });
    const raw = { anything: 1 };
    expect(validateSettings('no-such-style', raw)).toBe(raw);
  });

  it('validates a settings object once and reuses the result', () => {
    const spy = vi.spyOn(schema, 'safeParse');
    const settings = { color: '#abc' };
    const first = validateSettings('registry-test', settings);
    const second = validateSettings('registry-test', settings);
    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);

    // A new settings object (the store never edits one in place) is validated again.
    const next = validateSettings('registry-test', { ...settings, color: '#def' });
    expect(next).toEqual({ color: '#def' });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('re-validates the same settings against a different style', () => {
    const other = z.object({ size: z.number().default(4) });
    registerStyle(makeStyle('registry-test-other', other, { size: 4 }));
    const settings = {};
    expect(validateSettings('registry-test', settings)).toEqual({ color: '#000' });
    expect(validateSettings('registry-test-other', settings)).toEqual({ size: 4 });
  });
});
