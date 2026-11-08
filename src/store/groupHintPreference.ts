/** Whether the one-time hint about Ctrl+G has been shown. A per-user preference, kept out of the project. */
export const GROUP_HINT_STORAGE_KEY = 'lil-mappo-group-hint-seen';

export function readGroupHintSeen(): boolean {
  try {
    return localStorage.getItem(GROUP_HINT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeGroupHintSeen(): void {
  try {
    localStorage.setItem(GROUP_HINT_STORAGE_KEY, 'true');
  } catch {
    // Storage may be blocked; the hint may then show again next visit.
  }
}
