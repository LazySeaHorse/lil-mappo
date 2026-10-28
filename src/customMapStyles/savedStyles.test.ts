import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVED_MAP_STYLES_STORAGE_KEY, useSavedMapStyles } from './savedStyles';
import type { CustomMapStyle } from './model';

const ink: CustomMapStyle = { name: 'Ink', colors: { land: '#101820' }, theme: 'default' };
const paper: CustomMapStyle = { name: 'Paper', colors: { land: '#f2e8d5' }, theme: 'faded' };
const store = () => useSavedMapStyles.getState();
const stored = () => JSON.parse(localStorage.getItem(SAVED_MAP_STYLES_STORAGE_KEY) ?? '[]');

describe('saved map styles', () => {
  beforeEach(() => {
    localStorage.removeItem(SAVED_MAP_STYLES_STORAGE_KEY);
    store().reload();
  });

  it('saves newest first and keeps the list in this browser', () => {
    store().save('light', ink);
    store().save('standard', paper);
    expect(store().styles.map((s) => [s.style.name, s.mapStyle])).toEqual([['Paper', 'standard'], ['Ink', 'light']]);
    expect(stored()).toEqual(store().styles);

    store().reload();
    expect(store().styles.map((s) => s.style)).toEqual([paper, ink]);
  });

  it('replaces a saved style of the same name in place, keeping its id', () => {
    const first = store().save('light', ink);
    expect(first.replaced).toBe(false);
    store().save('standard', paper);
    const again = store().save('dark', { ...ink, name: ' ink ', colors: { land: '#000000' } });
    expect(again.replaced).toBe(true);
    expect(again.saved.id).toBe(first.saved.id);
    expect(store().styles.map((s) => [s.style.name, s.mapStyle])).toEqual([['Paper', 'standard'], [' ink ', 'dark']]);
  });

  it('removes a style and puts it back at its place', () => {
    store().save('light', ink);
    const { saved: paperSaved } = store().save('standard', paper);
    store().save('dark', { ...ink, name: 'Night' });

    const removed = store().remove(paperSaved.id);
    expect(removed?.index).toBe(1);
    expect(store().styles.map((s) => s.style.name)).toEqual(['Night', 'Ink']);
    store().restore(removed!.saved, removed!.index);
    expect(store().styles.map((s) => s.style.name)).toEqual(['Night', 'Paper', 'Ink']);
    expect(store().remove('missing')).toBeUndefined();
  });

  it('leaves out entries it cannot read', () => {
    localStorage.setItem(SAVED_MAP_STYLES_STORAGE_KEY, JSON.stringify([
      { id: 'a', mapStyle: 'light', style: ink, savedAt: '2026-10-28T00:00:00.000Z' },
      { id: 'b', mapStyle: 'gone', style: ink, savedAt: '2026-10-28T00:00:00.000Z' },
      { id: 'c', mapStyle: 'light', style: { name: 'Bad', colors: { land: 'red' } }, savedAt: '2026-10-28T00:00:00.000Z' },
    ]));
    store().reload();
    expect(store().styles.map((s) => s.id)).toEqual(['a']);

    localStorage.setItem(SAVED_MAP_STYLES_STORAGE_KEY, '{not json');
    store().reload();
    expect(store().styles).toEqual([]);
  });

  it('keeps working when storage is blocked', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      store().save('light', ink);
      expect(store().styles).toHaveLength(1);
    } finally {
      setItem.mockRestore();
    }
  });
});
