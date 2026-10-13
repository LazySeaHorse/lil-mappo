import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/useProjectStore';
import { useRouteDraft } from '@/hooks/useRouteDraft';
import { routeSummary } from '@/engine/routeDraft';
import { ROUTE_PATH_TERMS } from '@/lib/terms';
import type { RouteItem } from '@/store/types';
import { RoutePlanner } from './RoutePlanner';

/**
 * The body of the Path section: one line that says what the route is, and an Edit
 * button that opens the planner as a draft. Apply and Cancel show only while the draft
 * differs from the saved route. Render it with `key={item.id}`, so a draft never moves to another route.
 */
export function RoutePathSection({ item }: { item: RouteItem }) {
  const editor = useRouteDraft(item);
  const { draft, changed, loading } = editor;
  const isEditing = draft !== null;
  const summary = routeSummary(item);

  // Closing the panel or selecting another route drops an open draft.
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
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-medium text-foreground" title={summary} data-testid="route-summary">
          {summary}
        </p>
        {/* While the draft has changes, Apply and Cancel replace this button. */}
        {!changed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={isEditing}
            onClick={isEditing ? editor.discard : editor.start}
            className="h-7 shrink-0 px-3 text-xs"
          >
            {isEditing ? ROUTE_PATH_TERMS.close : ROUTE_PATH_TERMS.edit}
          </Button>
        )}
      </div>

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
          <Button type="button" variant="outline" onClick={editor.discard} className="h-9 flex-1 text-xs font-medium">
            {ROUTE_PATH_TERMS.cancel}
          </Button>
        </div>
      )}
    </div>
  );
}
