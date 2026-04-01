import React, { useRef } from 'react';
import Toolbar from '@/components/Toolbar/Toolbar';
import MapViewport from '@/components/MapViewport/MapViewport';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import TimelinePanel from '@/components/Timeline/TimelinePanel';
import { usePlayback } from '@/hooks/usePlayback';

export default function MapStudioEditor() {
  const mapRef = useRef(null);
  usePlayback(mapRef);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        <MapViewport />
        <InspectorPanel />
      </div>
      <TimelinePanel />
    </div>
  );
}
