import { DEFAULT_TIMING, type DemoRunSettings, type DemoTiming } from '../protocol';

/** The widget's run settings, remembered between sessions in localStorage. */

export const SETTINGS_KEY = 'lilmappo-demo-settings';
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3;
export const ZOOM_MIN = 1.2;
export const ZOOM_MAX = 2.5;
const TIMING_MAX = 60_000;

export const DEFAULT_PROMPT = 'Make me an animated map of my trip: Paris to Lyon by train, then down to Nice.';

export const DEFAULT_SETTINGS: DemoRunSettings = {
  timing: DEFAULT_TIMING,
  speed: 1,
  mockAi: false,
  aiPrompt: DEFAULT_PROMPT,
  autoZoom: true,
  maxZoom: 1.8,
};

export const TIMING_FIELDS: { key: keyof DemoTiming; label: string }[] = [
  { key: 'move', label: 'Move' },
  { key: 'typeChar', label: 'Per char' },
  { key: 'afterClick', label: 'After click' },
  { key: 'inspectorEdit', label: 'Inspector' },
  { key: 'betweenSteps', label: 'Between' },
];

export function clampSpeed(speed: unknown): number {
  const n = typeof speed === 'number' && Number.isFinite(speed) ? speed : 1;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n));
}

export function clampMaxZoom(zoom: unknown): number {
  const n = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : DEFAULT_SETTINGS.maxZoom;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

function cleanMs(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(TIMING_MAX, Math.round(value)) : fallback;
}

/** Whatever was stored (or typed), made into valid settings: unknown or broken fields fall back to defaults. */
export function sanitizeSettings(raw: unknown): DemoRunSettings {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof DemoRunSettings, unknown>>) : {};
  const t = r.timing && typeof r.timing === 'object' ? (r.timing as Partial<Record<keyof DemoTiming, unknown>>) : {};
  const timing = { ...DEFAULT_TIMING };
  for (const { key } of TIMING_FIELDS) timing[key] = cleanMs(t[key], DEFAULT_TIMING[key]);
  return {
    timing,
    speed: clampSpeed(r.speed),
    mockAi: typeof r.mockAi === 'boolean' ? r.mockAi : DEFAULT_SETTINGS.mockAi,
    aiPrompt: typeof r.aiPrompt === 'string' ? r.aiPrompt : DEFAULT_SETTINGS.aiPrompt,
    autoZoom: typeof r.autoZoom === 'boolean' ? r.autoZoom : DEFAULT_SETTINGS.autoZoom,
    maxZoom: clampMaxZoom(r.maxZoom),
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(storage: StorageLike | null = defaultStorage()): DemoRunSettings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveSettings(settings: DemoRunSettings, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota: the settings just are not remembered.
  }
}
