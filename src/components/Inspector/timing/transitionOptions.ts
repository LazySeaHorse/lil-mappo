import { TRANSITION_LABELS } from '@/annotations/animation';

/** Picker options for a transition list, keeping an unrecognised saved value selectable. */
export function transitionOptions(names: readonly string[], current: string) {
  const all = names.includes(current) ? names : [...names, current];
  return all.map((value) => ({ value, label: TRANSITION_LABELS[value] ?? value }));
}
