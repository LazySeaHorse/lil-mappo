import React, { useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import Toolbar from '@/components/Toolbar/Toolbar';
import MapViewport from '@/components/MapViewport/MapViewport';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import TimelinePanel from '@/components/Timeline/TimelinePanel';
import ExportModal from '@/components/ExportModal/ExportModal';
import ProjectLibraryModal from '@/components/ProjectLibrary/ProjectLibraryModal';
import { usePlayback } from '@/hooks/usePlayback';
import { MapRefContext } from '@/hooks/useMapRef';

export default function MapStudioEditor() {
  const mapRef = useRef<MapRef | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  usePlayback(mapRef);

  return (
    <MapRefContext.Provider value={mapRef}>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        <Toolbar 
          onExport={() => setShowExport(true)} 
          onLibrary={() => setShowLibrary(true)} 
        />
        <div className="flex flex-1 min-h-0">
          <MapViewport mapRef={mapRef} />
          <InspectorPanel />
        </div>
        <TimelinePanel />
        {showExport && <ExportModal onClose={() => setShowExport(false)} />}
        {showLibrary && <ProjectLibraryModal onClose={() => setShowLibrary(false)} />}
      </div>
    </MapRefContext.Provider>
  );
}
