import React from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { useShallow } from "zustand/react/shallow";
import { ProjectSettings } from "./ProjectSettings";
import { RouteInspector } from "./RouteInspector";
import { BoundaryInspector } from "./BoundaryInspector";
import { CalloutInspector } from "./CalloutInspector";
import { CameraKFInspector } from "./CameraKFInspector";
import { AutoCamInspector } from "./AutoCamInspector";
import type { RouteItem } from "@/store/types";

export default function InspectorPanel() {
  const { selectedItemId, selectedAutoCamRouteId, items, isInspectorOpen } = useProjectStore(
    useShallow(s => ({
      selectedItemId: s.selectedItemId,
      selectedAutoCamRouteId: s.selectedAutoCamRouteId,
      items: s.items,
      isInspectorOpen: s.isInspectorOpen,
    }))
  );

  if (!isInspectorOpen) return null;
  if (!selectedItemId) return <ProjectSettings />;

  const item = items[selectedItemId];
  if (!item) return <ProjectSettings />;

  switch (item.kind) {
    case "route":
      if (selectedAutoCamRouteId === selectedItemId && (item as RouteItem).autoCam?.enabled) {
        return <AutoCamInspector item={item as RouteItem} />;
      }
      return <RouteInspector item={item as RouteItem} />;
    case "boundary":
      return <BoundaryInspector item={item} />;
    case "callout":
      return <CalloutInspector item={item} />;
    case "camera":
      return <CameraKFInspector item={item} />;
    default:
      return <ProjectSettings />;
  }
}
