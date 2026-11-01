import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMING } from '../protocol';
import { DEFAULT_SETTINGS, SETTINGS_KEY, clampSpeed, loadSettings, sanitizeSettings, saveSettings } from './settings';

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
    const settings = { timing: { ...DEFAULT_TIMING, move: 400 }, speed: 1.5, mockAi: true, aiPrompt: 'Map Japan' };
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

  it('clamps speed into 0.5x to 3x', () => {
    expect(clampSpeed(0.1)).toBe(0.5);
    expect(clampSpeed(2)).toBe(2);
    expect(clampSpeed(Number.NaN)).toBe(1);
  });
});
