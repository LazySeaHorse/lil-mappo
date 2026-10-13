import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { useRoutePath } from '@/hooks/useRoutePath';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { vehicleChangePatch } from '@/config/vehicles';
import { buildWalkGeometry } from '@/engine/routeCurves';
import { convertRouteCalculation } from '@/engine/routeMode';
import { routeDraftChanged } from '@/engine/routeDraft';
import { ROUTE_PATH_TERMS } from '@/lib/terms';
import type { RouteCalculation, RouteItem, RouteMode } from '@/store/types';

const DEFAULT_VEHICLE = { enabled: false, type: 'dot' as const, modelId: '', scale: 1 };

/**
 * The path editor of one route. Edits go to a draft (`routeDraft` in the store) and the
 * route stays as saved until `apply`, which writes the draft as one undoable update and
 * frames the result on the map. `discard` drops the draft.
 */
export function useRouteDraft(item: RouteItem) {
  const draft = useProjectStore((s) => (s.routeDraft?.routeId === item.id ? s.routeDraft.calculation : null));
  const path = useRoutePath(item.id);
  const frame = useFrameOnMap();

  const changed = draft ? routeDraftChanged(item.calculation, draft) : false;

  const clearTransient = () => {
    path.cancel();
    const store = useProjectStore.getState();
    if (store.activePicker?.ownerId === item.id) store.stopPicking();
    store.setPreviewRoute(null);
  };

  const start = () => useProjectStore.getState().startRouteDraft(item.id);

  const discard = () => {
    clearTransient();
    useProjectStore.getState().discardRouteDraft();
  };

  const edit = (update: (calc: RouteCalculation) => RouteCalculation) =>
    useProjectStore.getState().updateRouteDraft(update);

  /**
   * Switching mode carries the points across (see `convertRouteCalculation`). Like every
   * other edit, it only changes the draft.
   */
  const setMode = (mode: RouteMode) => {
    clearTransient();
    edit((calc) => convertRouteCalculation(calc, mode));
  };

  const apply = async () => {
    const calc = useProjectStore.getState().routeDraft?.calculation;
    if (!calc) return;

    const commit = (geojson?: GeoJSON.FeatureCollection) => {
      const store = useProjectStore.getState();
      const route = store.items[item.id];
      if (route?.kind !== 'route') return;
      store.updateItem(item.id, {
        ...vehicleChangePatch(route, calc, calc.vehicle ?? DEFAULT_VEHICLE),
        ...(geojson ? { geojson } : {}),
      });
      clearTransient();
      store.discardRouteDraft();
      frame.frameGeometry(geojson ?? route.geojson);
      toast.success(ROUTE_PATH_TERMS.applied);
    };

    if (calc.mode === 'walk') {
      // A walk edit always redraws. A switch to walk with too few points keeps the old path, which cannot be rebuilt.
      const route = useProjectStore.getState().items[item.id];
      const wasWalk = route?.kind === 'route' && route.calculation?.mode === 'walk';
      commit(wasWalk || calc.points.length >= 2 ? buildWalkGeometry(calc) : undefined);
      return;
    }
    await path.compute(calc, commit);
  };

  return { draft, changed, loading: path.loading, path, start, discard, edit, setMode, apply };
}

export type RouteDraftEditor = ReturnType<typeof useRouteDraft>;
