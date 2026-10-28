import React from 'react';
import { Clapperboard, Video, Plus, Layers2, X, Mountain, Building2, EyeOff, Settings2 } from 'lucide-react';
import { RouteAddDropdown } from './RouteAddDropdown';
import { AnnotationAddDropdown } from '@/annotations/toolbar/AnnotationAddDropdown';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { ToolbarButton, ToolbarToggle, Divider } from './ToolbarPrimitives';
import { MapStylePicker } from './MapStylePicker';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ui/icon-button';
import { AiToolbarButton } from '@/components/AI/AiToolbarButton';
import { HistoryButtons } from './HistoryButtons';
import { ModelImportButton } from './ModelImportButton';
import { useWalkthroughStore } from '@/components/Onboarding/useWalkthroughStore';
import { useMapStyleCapabilities } from '@/hooks/useMapStyleCapabilities';
import { CAMERA_VIEW_TERMS } from '@/lib/terms';

interface MobileToolbarLayoutProps {
  mobileMode: 'default' | 'add' | 'layers';
  setMobileMode: (mode: 'default' | 'add' | 'layers') => void;
  activeDropdown: 'route' | 'callout' | 'boundary' | null;
  setActiveDropdown: (d: 'route' | 'callout' | 'boundary' | null) => void;
  onExport: () => void;
  onImportClick: () => void;
  onHideUI: () => void;
  renderAvatarMenu: () => React.ReactNode;
  // Layer group props
  terrainEnabled: boolean;
  setTerrainEnabled: (v: boolean) => void;
  buildingsEnabled: boolean;
  setBuildingsEnabled: (v: boolean) => void;
  terrainLoading: boolean;
  isPlaying2: boolean;
  /** Phones cannot run the AI panel, so its button is not rendered. */
  hideAi?: boolean;
  isScrubbing: boolean;
  handleAddCameraKF: () => void;
  onProjectSettings: () => void;
}

export function MobileToolbarLayout({
  mobileMode, setMobileMode,
  activeDropdown, setActiveDropdown,
  onExport,
  onImportClick, onHideUI, renderAvatarMenu,
  terrainEnabled, setTerrainEnabled,
  buildingsEnabled, setBuildingsEnabled,
  terrainLoading,
  isPlaying2, isScrubbing, hideAi,
  handleAddCameraKF,
  onProjectSettings,
}: MobileToolbarLayoutProps) {
  const buildingsAvailable = useMapStyleCapabilities().buildings3d === true;

  const openAddMenu = () => {
    setMobileMode('add');
    useWalkthroughStore.getState().send({ type: 'add-menu-opened' });
  };

  return (
    <div className="w-full flex items-center h-full relative overflow-hidden">
      {mobileMode === 'default' && (
        <div className="flex items-center w-full animate-in slide-in-from-left-4 duration-300 fill-mode-both">
          {renderAvatarMenu()}
          <Divider />
          <IconButton variant="toolbar" size="sm" onClick={openAddMenu} title="Add New Track" data-walkthrough="add-menu">
            <Plus size={20} />
          </IconButton>
          <Divider />
          <IconButton variant="toolbar" size="sm" onClick={() => setMobileMode('layers')} title="Map Display" data-walkthrough="map-tools">
            <Layers2 size={20} />
          </IconButton>
          <Divider />
          <HistoryButtons iconSize={18} />
          <div className="flex-1" />
          {!hideAi && (
            <>
              <AiToolbarButton iconSize={18} />
              <div className="w-1" />
            </>
          )}
          <ToolbarButton icon={<Clapperboard size={18} />} label="Export" hideLabel onClick={onExport} walkthroughTarget="render" />
          <div className="w-1" />
          <ToolbarButton icon={<EyeOff size={18} />} label="Hide UI" hideLabel onClick={onHideUI} />
        </div>
      )}

      {mobileMode === 'add' && (
        <div className="flex items-center w-full animate-in slide-in-from-right-4 duration-300 fill-mode-both">
          <div className="flex items-center gap-2 w-full justify-between px-2">
            <RouteAddDropdown onImportClick={onImportClick} isOpen={activeDropdown === 'route'} onOpenChange={(open) => setActiveDropdown(open ? 'route' : null)} />
            <BoundaryAddDropdown isOpen={activeDropdown === 'boundary'} onOpenChange={(open) => setActiveDropdown(open ? 'boundary' : null)} />
            <AnnotationAddDropdown isOpen={activeDropdown === 'callout'} onOpenChange={(open) => setActiveDropdown(open ? 'callout' : null)} />
            <ToolbarButton icon={<Video size={18} />} label={CAMERA_VIEW_TERMS.add} hideLabel onClick={handleAddCameraKF} walkthroughTarget="camera-keyframe" />
            <ModelImportButton iconSize={18} />
            <IconButton variant="secondary" size="sm" onClick={() => { setMobileMode('default'); setActiveDropdown(null); }}>
              <X size={16} />
            </IconButton>
          </div>
        </div>
      )}

      {mobileMode === 'layers' && (
        <div className="flex items-center w-full animate-in slide-in-from-right-4 duration-300 fill-mode-both">
          <div className="flex items-center gap-2 w-full justify-between px-2">
            <div className="flex items-center gap-1 px-1 flex-1">
              <MapStylePicker className="flex-1" />
            </div>
            <ToolbarButton icon={<Settings2 size={16} />} label="Map Settings" hideLabel onClick={onProjectSettings} walkthroughTarget="map-settings" />
            <div data-walkthrough="map-3d" className="flex items-center gap-1">
              <ToolbarToggle icon={<Mountain size={16} />} label="Terrain" hideLabel active={terrainEnabled} onClick={() => setTerrainEnabled(!terrainEnabled)} loading={terrainLoading && !isPlaying2 && !isScrubbing} />
              <ToolbarToggle icon={<Building2 size={16} />} label="Buildings" hideLabel active={buildingsEnabled} onClick={() => setBuildingsEnabled(!buildingsEnabled)} disabled={!buildingsAvailable} />
            </div>
            <IconButton variant="secondary" size="sm" onClick={() => setMobileMode('default')}>
              <X size={16} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
