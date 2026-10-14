import { useCallback } from 'react';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import {
  INSPECTOR_SECTIONS,
  type InspectorSectionConfig,
  type InspectorSectionId,
  type InspectorSectionKind,
} from './inspectorSections';

/** Open or closed state of one panel's sections, remembered between visits. */
export function useInspectorSections<K extends InspectorSectionKind>(kind: K) {
  const choices = useUiPreferencesStore((s) => s.inspectorSections[kind]);
  const setOpenPreference = useUiPreferencesStore((s) => s.setInspectorSectionOpen);
  const sections: readonly InspectorSectionConfig[] = INSPECTOR_SECTIONS[kind];

  const isOpen = useCallback(
    (id: InspectorSectionId<K>) => {
      const saved = choices?.[id];
      if (saved !== undefined) return saved;
      return sections.find((section) => section.id === id)?.defaultOpen ?? true;
    },
    [choices, sections],
  );

  const setOpen = useCallback(
    (id: InspectorSectionId<K>, open: boolean) => setOpenPreference(kind, id, open),
    [kind, setOpenPreference],
  );

  const toggle = useCallback((id: InspectorSectionId<K>) => setOpen(id, !isOpen(id)), [isOpen, setOpen]);

  return { sections, isOpen, setOpen, toggle };
}
