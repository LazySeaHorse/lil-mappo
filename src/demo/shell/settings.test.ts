import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMING } from '../protocol';
import { DEFAULT_SETTINGS, SETTINGS_KEY, clampMaxZoom, clampSpeed, loadSettings, sanitizeSettings, saveSettings } from './settings';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('settings persistence', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const settings = { timing: { ...DEFAULT_TIMING, move: 400 }, speed: 1.5, mockAi: true, aiPrompt: 'Map Japan', autoZoom: false, maxZoom: 2.2, fullScreen: true, terminalShare: 1 / 3 };
    saveSettings(settings, storage);
    expect(JSON.parse(storage.data[SETTINGS_KEY])).toEqual(settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('falls back to defaults with nothing stored, broken JSON, or a throwing storage', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{oops' }))).toEqual(DEFAULT_SETTINGS);
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, throwing)).not.toThrow();
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the valid fields of a partial or stale record', () => {
    const s = sanitizeSettings({ timing: { move: 250, typeChar: -5, afterClick: 'x' }, speed: 9, mockAi: 'yes', extra: 1 });
    expect(s.timing).toEqual({ ...DEFAULT_TIMING, move: 250 });
    expect(s.speed).toBe(3);
    expect(s.mockAi).toBe(false);
    expect(s.aiPrompt).toBe(DEFAULT_SETTINGS.aiPrompt);
  });

  it('sanitizes the auto zoom fields', () => {
    expect(sanitizeSettings(null)).toMatchObject({ autoZoom: true, maxZoom: 1.8 });
    expect(sanitizeSettings({ autoZoom: 'no', maxZoom: 'big' })).toMatchObject({ autoZoom: true, maxZoom: 1.8 });
    expect(sanitizeSettings({ autoZoom: false, maxZoom: 2 })).toMatchObject({ autoZoom: false, maxZoom: 2 });
  });

  it('clamps the max zoom into 1.2x to 2.5x', () => {
    expect(clampMaxZoom(0.5)).toBe(1.2);
    expect(clampMaxZoom(9)).toBe(2.5);
    expect(clampMaxZoom(Number.NaN)).toBe(1.8);
  });

  it('clamps speed into 0.5x to 3x', () => {
    expect(clampSpeed(0.1)).toBe(0.5);
    expect(clampSpeed(2)).toBe(2);
    expect(clampSpeed(Number.NaN)).toBe(1);
  });
});

describe('full screen and split settings', () => {
  it('default to floating windows with Claude at a quarter', () => {
    expect(sanitizeSettings(null)).toMatchObject({ fullScreen: false, terminalShare: 0.25 });
  });

  it('keep a boolean full screen and only the two known shares', () => {
    expect(sanitizeSettings({ fullScreen: true, terminalShare: 1 / 3 })).toMatchObject({ fullScreen: true, terminalShare: 1 / 3 });
    expect(sanitizeSettings({ fullScreen: 'yes', terminalShare: 0.4 })).toMatchObject({ fullScreen: false, terminalShare: 0.25 });
    expect(sanitizeSettings({ terminalShare: 'third' }).terminalShare).toBe(0.25);
    expect(sanitizeSettings({ terminalShare: 0.333 }).terminalShare).toBe(1 / 3);
  });
});
