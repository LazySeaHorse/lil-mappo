import { useProjectStore } from '@/store/useProjectStore';

const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const OWN_ESCAPE = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="combobox"]';

/**
 * Whether an Escape keydown belongs to something else: a handler that already
 * consumed it (Radix layers prevent default when they dismiss), text being
 * edited, or an open dialog, menu or list that closes itself on Escape.
 */
export function isEscapeHandledElsewhere(e: Pick<KeyboardEvent, 'defaultPrevented' | 'target'>): boolean {
  if (e.defaultPrevented) return true;
  const target = e.target;
  if (!(target instanceof Element)) return false;
  return target.closest(TEXT_ENTRY) !== null || target.closest(OWN_ESCAPE) !== null;
}

/** Escape ends an active map picker, else clears the selection. */
export function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const s = useProjectStore.getState();
  if (s.activePicker) {
    s.stopPicking();
  } else if (s.selectedItemId && !isEscapeHandledElsewhere(e)) {
    // Like the delete path, this leaves the inspector on project settings; a closed one stays closed.
    const wasInspectorOpen = s.isInspectorOpen;
    s.selectItem(null);
    if (!wasInspectorOpen) s.setIsInspectorOpen(false);
  }
}
