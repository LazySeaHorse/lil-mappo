import { vi } from 'vitest';

type Listener = (event: unknown) => void;

/**
 * Test double of Mapbox GL's model API as mapbox-gl 3.x behaves (Style + ModelManager):
 * - `addModel` starts an asynchronous load. The same id and url again only counts a reference.
 * - `hasModel` is false until the load finishes, and stays false forever if it fails.
 * - `removeModel` refuses (fires an 'error') unless `hasModel` is true, so a pending load cannot be
 *   removed: it lands in the style later anyway.
 * - A finished load fires 'styledata'; a failed one fires the 'error' Mapbox fires, whose message is
 *   "Could not load model <id> from <url>".
 * Spread `api` into a map double; drive loads with `finishLoads` and `failLoad`.
 */
export function createMapboxModels() {
  const listeners = new Map<string, Set<Listener>>();
  /** Every model the style knows of, by id: its url. */
  const requested = new Map<string, string>();
  const pending = new Set<string>();
  const loaded = new Set<string>();
  const failed = new Set<string>();

  const fire = (type: string, event: unknown) => listeners.get(type)?.forEach((listener) => listener(event));

  const api = {
    on: vi.fn((type: string, listener: Listener) => {
      const group = listeners.get(type) ?? new Set();
      group.add(listener);
      listeners.set(type, group);
    }),
    off: vi.fn((type: string, listener: Listener) => listeners.get(type)?.delete(listener)),
    hasModel: vi.fn((id: string) => loaded.has(id)),
    addModel: vi.fn((id: string, url: string) => {
      if (requested.get(id) === url) return;
      requested.set(id, url);
      loaded.delete(id);
      failed.delete(id);
      pending.add(id);
    }),
    removeModel: vi.fn((id: string) => {
      if (!loaded.has(id)) {
        fire('error', { type: 'error', error: new Error('No model with this ID exists.') });
        return;
      }
      loaded.delete(id);
      requested.delete(id);
    }),
  };

  return {
    api,
    listeners,
    fire,
    requested,
    pending,
    loaded,
    failed,
    /** Models that hold (or will hold) a model in the style: loaded ones and loads still pending. */
    inStyle: () => new Set([...loaded, ...pending]),
    /** Every pending load succeeds. */
    finishLoads: () => {
      for (const id of pending) loaded.add(id);
      pending.clear();
      fire('styledata', { type: 'styledata', dataType: 'style' });
    },
    /** One pending load fails, as a broken file does. */
    failLoad: (id: string) => {
      pending.delete(id);
      failed.add(id);
      fire('error', { type: 'error', error: new Error(`Could not load model ${id} from ${requested.get(id)}`) });
      fire('styledata', { type: 'styledata', dataType: 'style' });
    },
  };
}
