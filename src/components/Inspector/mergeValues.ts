import { deepEqual } from '@/lib/deepEqual';

/** The fields on which the selected clips hold different values. */
export type MixedFields<T> = ReadonlySet<keyof T>;

export interface MergedValues<T> {
  /** What a control shows: the first object's values. Check `mixed` before trusting one. */
  value: T;
  mixed: MixedFields<T>;
}

/** Lines up the same settings from several clips, for a panel that edits them together. */
export function mergeValues<T extends object>(values: readonly T[]): MergedValues<T> {
  const [first, ...rest] = values;
  const keys = new Set(values.flatMap((value) => Object.keys(value) as (keyof T)[]));
  const mixed = new Set([...keys].filter((key) => rest.some((value) => !deepEqual(first[key], value[key]))));
  return { value: first, mixed };
}
