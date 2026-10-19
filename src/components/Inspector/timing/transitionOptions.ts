import { TRANSITION_LABELS } from '@/annotations/animation';

/** Picker options for a transition list, keeping an unrecognised saved value selectable. */
export function transitionOptions(names: readonly string[], current: string, labels: Record<string, string> = TRANSITION_LABELS) {
  const all = names.includes(current) ? names : [...names, current];
  return all.map((value) => ({ value, label: labels[value] ?? value }));
}
