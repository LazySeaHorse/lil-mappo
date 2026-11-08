import type { TimelineGroup } from './types';

/** Group colours, in the order new groups take them. They stand apart from the clip colours. */
export const GROUP_COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ec4899', '#84cc16', '#f97316'] as const;

type Groups = Record<string, TimelineGroup>;

/** The first colour with the fewest groups already using it. */
export function nextGroupColor(groups: Groups): string {
  const uses = (color: string) => Object.values(groups).filter((group) => group.color === color).length;
  return GROUP_COLORS.reduce<string>((best, color) => (uses(color) < uses(best) ? color : best), GROUP_COLORS[0]);
}

/** `itemOrder` with the members next to each other, at the place of the first one and in their own order. */
export function gatherInOrder(itemOrder: readonly string[], members: ReadonlySet<string>): string[] {
  const at = itemOrder.findIndex((id) => members.has(id));
  if (at < 0) return [...itemOrder];
  return [
    ...itemOrder.slice(0, at),
    ...itemOrder.filter((id) => members.has(id)),
    ...itemOrder.slice(at).filter((id) => !members.has(id)),
  ];
}

/** The groups without these clips. A group left with fewer than two is gone; nothing to do returns `groups` itself. */
export function withoutMembers(groups: Groups, gone: ReadonlySet<string>): Groups {
  let changed = false;
  const next: Groups = {};
  for (const group of Object.values(groups)) {
    const itemIds = group.itemIds.filter((id) => !gone.has(id));
    if (itemIds.length === group.itemIds.length) next[group.id] = group;
    else {
      changed = true;
      if (itemIds.length >= 2) next[group.id] = { ...group, itemIds };
    }
  }
  return changed ? next : groups;
}

/** The groups as they can stand with these items: for documents edited by hand or by older versions. */
export function pruneGroups(groups: Groups, items: Readonly<Record<string, unknown>>): Groups {
  const unknown = Object.values(groups).flatMap((group) => group.itemIds).filter((id) => !(id in items));
  const pruned = withoutMembers(groups, new Set(unknown));
  return Object.fromEntries(Object.entries(pruned).filter(([, group]) => group.itemIds.length >= 2));
}
