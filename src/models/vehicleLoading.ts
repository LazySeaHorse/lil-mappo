import { create } from 'zustand';

/**
 * The routes whose built-in Car or Plane marker is still loading its 3D model on the map. The map
 * runtime (`RouteRenderer`) sets and clears it; the inspector reads it to show a spinner on the tile.
 */
export const useVehicleLoading = create<{ routeIds: ReadonlySet<string> }>(() => ({ routeIds: new Set() }));

export function setVehicleModelLoading(routeId: string, loading: boolean): void {
  const { routeIds } = useVehicleLoading.getState();
  if (routeIds.has(routeId) === loading) return;
  const next = new Set(routeIds);
  if (loading) next.add(routeId);
  else next.delete(routeId);
  useVehicleLoading.setState({ routeIds: next });
}

/** Re-renders when the route's marker model starts or stops loading. */
export function useVehicleModelLoading(routeId: string): boolean {
  return useVehicleLoading((s) => s.routeIds.has(routeId));
}
