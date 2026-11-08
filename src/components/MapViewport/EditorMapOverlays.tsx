import { useProjectStore } from '@/store/useProjectStore';
import { showsEditorOverlays } from '@/store/editorOverlays';
import { RouteWaypointMarkers, DraftWalkMarkers } from './RouteWaypointMarkers';
import { ModelDragHandle } from './ModelDragHandle';

/** The editing handles drawn over the map: nothing where the map shows the video (see `showsEditorOverlays`). */
export function EditorMapOverlays() {
  const visible = useProjectStore(showsEditorOverlays);
  if (!visible) return null;
  return (
    <>
      <RouteWaypointMarkers />
      <DraftWalkMarkers />
      <ModelDragHandle />
    </>
  );
}
