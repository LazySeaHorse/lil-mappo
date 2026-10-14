import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/useProjectStore';
import { useRouteDraft } from '@/hooks/useRouteDraft';
import { editableKey } from '@/engine/routeDraft';
import { ROUTE_PATH_TERMS } from '@/lib/terms';
import type { RouteItem } from '@/store/types';
import { RoutePlanner } from './RoutePlanner';

/**
 * The body of the Path section: the planner, as a draft of the saved route. The draft starts
 * when the body shows and starts again when the saved path changes (Apply, undo). Apply and
 * Cancel show only while the draft differs from the saved route; Cancel resets the draft.
 * Render it with `key={item.id}`, so a draft never moves to another route.
 */
export function RoutePathSection({ item }: { item: RouteItem }) {
  const editor = useRouteDraft(item);
  const { draft, changed, loading } = editor;
  const savedKey = editableKey(item.calculation);

  useEffect(() => {
    useProjectStore.getState().startRouteDraft(item.id);
  }, [item.id, savedKey]);

  // Closing the panel or selecting another route drops the draft.
  useEffect(
    () => () => {
      const store = useProjectStore.getState();
      if (store.routeDraft?.routeId !== item.id) return;
      store.discardRouteDraft();
      store.setPreviewRoute(null);
      if (store.activePicker?.ownerId === item.id) store.stopPicking();
    },
    [item.id],
  );

  return (
    <div className="flex flex-col gap-3.5">
      {!item.calculation && <p className="text-xs text-muted-foreground">{ROUTE_PATH_TERMS.importedHint}</p>}

      {draft && <RoutePlanner routeId={item.id} calc={draft} editor={editor} />}

      {draft && changed && (
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => void editor.apply()}
            disabled={loading}
            className="h-9 flex-1 text-xs font-medium"
          >
            {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {ROUTE_PATH_TERMS.apply}
          </Button>
          <Button type="button" variant="outline" onClick={editor.reset} className="h-9 flex-1 text-xs font-medium">
            {ROUTE_PATH_TERMS.cancel}
          </Button>
        </div>
      )}
    </div>
  );
}
