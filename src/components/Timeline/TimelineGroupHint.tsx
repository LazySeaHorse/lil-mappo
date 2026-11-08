import { useEffect, useState } from 'react';
import { TIMELINE_GROUP_TERMS } from '@/lib/terms';
import { isMac } from '@/lib/platform';
import { useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';

const GROUP_KEYS = isMac ? '⌘G' : 'Ctrl+G';

/** Once ever: the first time several clips are selected, says how to group them, until the selection ends. */
export default function TimelineGroupHint() {
  const selectedCount = useProjectStore((s) => s.selectedItemIds.length);
  const groupCount = useProjectStore((s) => Object.keys(s.groups).length);
  const seen = useUiPreferencesStore((s) => s.groupHintSeen);
  const markSeen = useUiPreferencesStore((s) => s.markGroupHintSeen);
  const [showing, setShowing] = useState(false);

  useEffect(() => setShowing(false), [groupCount]);

  useEffect(() => {
    if (selectedCount < 2) setShowing(false);
    else if (!seen) {
      setShowing(true);
      markSeen();
    }
  }, [selectedCount, seen, markSeen]);

  if (!showing) return null;
  return (
    <div role="status" className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-1 text-2xs font-medium text-background shadow-md pointer-events-none">
      {TIMELINE_GROUP_TERMS.hint(GROUP_KEYS)}
    </div>
  );
}
