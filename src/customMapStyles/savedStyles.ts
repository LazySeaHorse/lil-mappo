import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getMapStyleDef } from '@/config/mapbox';
import type { CustomMapStyle } from './model';
import { customMapStyleSchema } from './schema';

/**
 * Custom styles the user saved to reuse in other projects. For now they live in this
 * browser; everything goes through this store, so moving them to the account only
 * changes how it reads and writes.
 */
export const SAVED_MAP_STYLES_STORAGE_KEY = 'lil-mappo-saved-map-styles';

export interface SavedMapStyle {
  id: string;
  /** The built-in style it is drawn over. */
  mapStyle: string;
  style: CustomMapStyle;
  /** ISO time of the last save. */
  savedAt: string;
}

const savedMapStyleSchema = z.object({
  id: z.string().min(1),
  mapStyle: z.string().refine((key) => getMapStyleDef(key) !== undefined),
  style: customMapStyleSchema,
  savedAt: z.string(),
});

/** The saved list; entries this build cannot read are left out. */
function readSavedStyles(): SavedMapStyle[] {
  try {
    const raw = localStorage.getItem(SAVED_MAP_STYLES_STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry) => {
      const parsed = savedMapStyleSchema.safeParse(entry);
      return parsed.success ? [parsed.data as SavedMapStyle] : [];
    });
  } catch {
    return [];
  }
}

function writeSavedStyles(styles: SavedMapStyle[]): void {
  try {
    localStorage.setItem(SAVED_MAP_STYLES_STORAGE_KEY, JSON.stringify(styles));
  } catch {
    // Storage may be blocked or full; the list still works until the page reloads.
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface SavedMapStylesState {
  /** Newest first. */
  styles: SavedMapStyle[];
  /** Saves `style` over `mapStyle` under its name. A saved style with the same name is replaced (it keeps its id and place). */
  save: (mapStyle: string, style: CustomMapStyle) => SavedMapStyle;
  /** Removes a saved style; returns it with its place in the list, for undo. */
  remove: (id: string) => { saved: SavedMapStyle; index: number } | undefined;
  /** Puts a removed style back at its place. */
  restore: (saved: SavedMapStyle, index: number) => void;
  /** Reads the list again from storage. */
  reload: () => void;
}

export const useSavedMapStyles = create<SavedMapStylesState>()((set, get) => {
  const commit = (styles: SavedMapStyle[]) => {
    writeSavedStyles(styles);
    set({ styles });
  };

  return {
    styles: readSavedStyles(),
    save: (mapStyle, style) => {
      const { styles } = get();
      const existing = styles.find((saved) => sameName(saved.style.name, style.name));
      const saved: SavedMapStyle = { id: existing?.id ?? nanoid(), mapStyle, style, savedAt: new Date().toISOString() };
      commit(existing ? styles.map((s) => (s === existing ? saved : s)) : [saved, ...styles]);
      return saved;
    },
    remove: (id) => {
      const { styles } = get();
      const index = styles.findIndex((saved) => saved.id === id);
      if (index < 0) return undefined;
      commit(styles.filter((_, i) => i !== index));
      return { saved: styles[index], index };
    },
    restore: (saved, index) => {
      const styles = get().styles.filter((s) => s.id !== saved.id);
      commit([...styles.slice(0, index), saved, ...styles.slice(index)]);
    },
    reload: () => set({ styles: readSavedStyles() }),
  };
});
