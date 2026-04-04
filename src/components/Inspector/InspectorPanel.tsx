import React from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { ProjectSettings } from "./ProjectSettings";
import { RouteInspector } from "./RouteInspector";
import { BoundaryInspector } from "./BoundaryInspector";
import { CalloutInspector } from "./CalloutInspector";
import { CameraKFInspector } from "./CameraKFInspector";

export default function InspectorPanel() {
  const { selectedItemId, items, isInspectorOpen } = useProjectStore();

  if (!isInspectorOpen) return null;

  if (!selectedItemId) return <ProjectSettings />;

  const item = items[selectedItemId];
  if (!item) return <ProjectSettings />;

  switch (item.kind) {
    case "route":
      return <RouteInspector item={item} />;
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
