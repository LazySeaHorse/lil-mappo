/**
 * Which inspector sections a user opened or closed is a per-user UI preference,
 * kept out of the project file. Only the choices a user made are stored, so a
 * section they never touched follows its default.
 */
export const INSPECTOR_SECTIONS_STORAGE_KEY = 'lil-mappo-inspector-sections';

/** Panel kind, then section id, then open (true) or closed (false). */
export type InspectorSectionChoices = Record<string, Record<string, boolean>>;

function isChoices(value: unknown): value is InspectorSectionChoices {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (panel) =>
      typeof panel === 'object' &&
      panel !== null &&
      !Array.isArray(panel) &&
      Object.values(panel).every((open) => typeof open === 'boolean'),
  );
}

export function readInspectorSections(): InspectorSectionChoices {
  try {
    const raw = localStorage.getItem(INSPECTOR_SECTIONS_STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return isChoices(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeInspectorSections(choices: InspectorSectionChoices): void {
  try {
    localStorage.setItem(INSPECTOR_SECTIONS_STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // Storage may be blocked; the choice just won't persist.
  }
}
