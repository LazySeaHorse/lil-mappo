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
import FontLoader from '@/components/FontLoader';
import { useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import { Eye, Play, Pause } from 'lucide-react';

export default function MapStudioEditor() {
  const mapRef = useRef<MapRef | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  usePlayback(mapRef);

  const mapStyle = useProjectStore(s => s.mapStyle);
  const hideUI = useProjectStore(s => s.hideUI);
  const setHideUI = useProjectStore(s => s.setHideUI);
  const isPlaying = useProjectStore(s => s.isPlaying);
  const setIsPlaying = useProjectStore(s => s.setIsPlaying);

  useEffect(() => {
    const isDark = mapStyle === 'dark' || mapStyle === 'satellite' || mapStyle === 'satelliteStreets';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [mapStyle]);

  return (
    <MapRefContext.Provider value={mapRef}>
      <FontLoader />
      <div className="h-screen w-screen relative overflow-hidden bg-background">
        {/* Map Background Layer */}
        <div className="absolute inset-0 z-0">
          <MapViewport mapRef={mapRef} />
        </div>
        
        {/* Floating UI Layer */}
        <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ${hideUI ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
          <Toolbar 
            onExport={() => setShowExport(true)} 
            onLibrary={() => setShowLibrary(true)} 
          />
          <InspectorPanel />
          <TimelinePanel />
        </div>

        {hideUI && (
          <div className="absolute top-4 left-4 z-50 pointer-events-auto flex gap-2.5">
            <Button 
              variant="secondary" 
              size="icon" 
              className="w-10 h-10 rounded-full shadow-2xl backdrop-blur-xl bg-white/90 text-slate-900 hover:bg-white border-none hover:scale-110 transition-transform active:scale-95"
              onClick={() => setHideUI(false)}
              title="Show UI"
            >
              <Eye size={20} />
            </Button>
            <Button 
              variant="secondary" 
              size="icon" 
              className="w-10 h-10 rounded-full shadow-2xl backdrop-blur-xl bg-white/90 text-slate-900 hover:bg-white border-none hover:scale-110 transition-transform active:scale-95"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </Button>
          </div>
        )}

        {showExport && <ExportModal onClose={() => setShowExport(false)} />}
        {showLibrary && <ProjectLibraryModal onClose={() => setShowLibrary(false)} />}
      </div>
    </MapRefContext.Provider>
  );
}
